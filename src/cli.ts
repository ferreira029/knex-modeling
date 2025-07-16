import * as fs from 'fs'
import * as path from 'path'
import { MigrationGenerator } from './MigrationGenerator'
import { InterfaceGenerator } from './InterfaceGenerator'
import { SchemaGenerator } from './SchemaGenerator'
import { ConfigManager, KnexModelingConfig } from './ConfigManager'
import { SchemaDefinition } from './types'

// Using KnexModelingConfig from ConfigManager instead

interface ModelInfo {
  name: string
  tableName: string
  schema: SchemaDefinition
  filePath: string
}

interface StoredSchemas {
  [modelName: string]: {
    tableName: string
    schema: SchemaDefinition
    lastModified: number
  }
}

class KnexModelingCLI {
  private options: KnexModelingConfig
  private schemasFile: string
  private interfaceGenerator: InterfaceGenerator

  constructor(options: KnexModelingConfig) {
    this.options = options
    this.schemasFile = path.join(this.options.migrationsDir, 'migrations-lock.json')
    this.interfaceGenerator = new InterfaceGenerator(this.options.interfacesDir)
  }

  async run(command: string, customName?: string): Promise<void> {
    switch (command) {
      case 'generate-migration':
        await this.generateMigrations(customName)
        break
      case 'generate-schema':
        await this.generateNewSchema(customName)
        break
      case 'generate-interfaces':
        await this.generateInterfaces()
        break
      case 'generate-all':
        await this.generateMigrations()
        await this.generateInterfaces()
        break
      case 'watch':
        await this.watchModels()
        break
      case 'init':
        await this.initializeProject()
        break
      case 'generate-schemas-from-migrations':
        await this.generateSchemasFromMigrations()
        break
      case 'config':
        this.showConfig()
        break
      default:
        showHelp()
    }
  }

  private async generateMigrations(customName?: string): Promise<void> {
    console.log('🔍 Scanning models for changes...')
    
    const currentModels = await this.scanModels()
    const storedSchemas = this.loadStoredSchemas()
    
    let hasChanges = false

    for (const model of currentModels) {
      const stored = storedSchemas[model.name]
      
      if (!stored) {
        // New model - create table migration
        console.log(`📄 New model detected: ${model.name}`)
        await this.createTableMigration(model, customName)
        hasChanges = true
      } else if (this.hasSchemaChanged(model.schema, stored.schema)) {
        // Model changed - create alter migration
        console.log(`🔄 Schema changes detected in: ${model.name}`)
        await this.createAlterMigration(model, stored, customName)
        hasChanges = true
      }
    }

    // Check for deleted models
    for (const storedName in storedSchemas) {
      if (!currentModels.find(m => m.name === storedName)) {
        console.log(`🗑️  Model deleted: ${storedName}`)
        await this.createDropTableMigration(storedSchemas[storedName])
        hasChanges = true
      }
    }

    if (hasChanges) {
      this.saveStoredSchemas(currentModels)
      console.log('✅ Migration generation completed!')
      
      // Auto-generate interfaces for new/changed models
      console.log('🔧 Auto-generating TypeScript interfaces...')
      await this.interfaceGenerator.generateMissingInterfaces(this.options.modelsDir)
      console.log('✅ Interface auto-generation completed!')
    } else {
      console.log('✨ No changes detected - all models are up to date!')
    }
  }

  private async generateNewSchema(schemaName?: string): Promise<void> {
    if (!schemaName) {
      console.error('❌ Schema name is required. Use --name flag to specify schema name.')
      process.exit(1)
    }

    // Ensure models directory exists
    if (!fs.existsSync(this.options.modelsDir)) {
      fs.mkdirSync(this.options.modelsDir, { recursive: true })
      console.log(`📁 Created models directory: ${this.options.modelsDir}`)
    }

    const schemaPath = path.join(this.options.modelsDir, `${schemaName}.ts`)
    
    if (fs.existsSync(schemaPath)) {
      console.error(`❌ Schema file already exists: ${schemaPath}`)
      process.exit(1)
    }

    const tableName = schemaName.toLowerCase()
    const modelTemplate = `import { createModel, defineSchema } from 'knex-modeling'

export const ${schemaName.toLowerCase()}Schema = defineSchema({
  id: { type: 'increments', primary: true },
  // token: { type: 'uuid', defaultTo: 'uuid_generate_v4()', primary: true },
  created_at: { type: 'timestamp', defaultTo: 'now' },
  updated_at: { type: 'timestamp', defaultTo: 'now' }
})

export const ${schemaName} = createModel({
  schema: ${schemaName.toLowerCase()}Schema,
  tableName: '${tableName}s'
})
`

    fs.writeFileSync(schemaPath, modelTemplate)
    console.log(`📄 Created new schema: ${schemaPath}`)
    console.log(`💡 Next steps:`)
    console.log(`   1. Edit the schema definition in ${schemaName}.ts`)
    console.log(`   2. Run "npx knex-modeling generate-migration" to create the table migration`)
  }

  private async generateInterfaces(): Promise<void> {
    console.log('🔧 Generating TypeScript interfaces...')
    
    await this.interfaceGenerator.generateMissingInterfaces(this.options.modelsDir)
    
    console.log('✅ Interface generation completed!')
  }

  private async scanModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = []
    
    if (!fs.existsSync(this.options.modelsDir)) {
      throw new Error(`Models directory not found: ${this.options.modelsDir}`)
    }

    const files = fs.readdirSync(this.options.modelsDir)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'))

    // Register ts-node for TypeScript files
    const hasTypeScriptFiles = files.some(file => file.endsWith('.ts'))
    if (hasTypeScriptFiles) {
      try {
        require('ts-node').register({ transpileOnly: true })
      } catch (error) {
        console.warn('⚠️  ts-node not available, falling back to compiled JavaScript files')
      }
    }

    for (const file of files) {
      const filePath = path.join(this.options.modelsDir, file)
      try {
        // Use require for TypeScript support
        const absolutePath = path.resolve(filePath)
        delete require.cache[absolutePath]
        const module = require(absolutePath)
        
        // Look for exported models (classes with schema property)
        for (const [exportName, exportValue] of Object.entries(module)) {
          if (this.isValidModel(exportValue)) {
            const model = exportValue as any
            models.push({
              name: exportName,
              tableName: model.tableName,
              schema: model.schema,
              filePath
            })
          }
        }
      } catch (error) {
        console.warn(`⚠️  Could not load model from ${file}:`, error)
      }
    }

    return models
  }

  private isValidModel(obj: any): boolean {
    return obj && 
           typeof obj === 'function' && 
           obj.schema && 
           obj.tableName &&
           typeof obj.schema === 'object' &&
           typeof obj.tableName === 'string'
  }

  private loadStoredSchemas(): StoredSchemas {
    if (!fs.existsSync(this.schemasFile)) {
      return {}
    }

    try {
      const content = fs.readFileSync(this.schemasFile, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      console.warn('⚠️  Could not load stored schemas, treating as empty')
      return {}
    }
  }

  private saveStoredSchemas(models: ModelInfo[]): void {
    const schemas: StoredSchemas = {}
    
    for (const model of models) {
      schemas[model.name] = {
        tableName: model.tableName,
        schema: model.schema,
        lastModified: Date.now()
      }
    }

    if (!fs.existsSync(this.options.migrationsDir)) {
      fs.mkdirSync(this.options.migrationsDir, { recursive: true })
    }

    fs.writeFileSync(this.schemasFile, JSON.stringify(schemas, null, 2))
  }

  private hasSchemaChanged(current: SchemaDefinition, stored: SchemaDefinition): boolean {
    return JSON.stringify(current) !== JSON.stringify(stored)
  }

  private async createTableMigration(model: ModelInfo, customName?: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
    const migrationName = customName 
      ? `${timestamp}_${customName}` 
      : `${timestamp}_create_${model.tableName}_table`
    
    const migrationContent = MigrationGenerator.generateCreateTableMigration(
      model.tableName,
      model.schema,
      migrationName
    )

    const migrationPath = path.join(this.options.migrationsDir, `${migrationName}.ts`)
    fs.writeFileSync(migrationPath, migrationContent)
    
    console.log(`📝 Created migration: ${migrationName}.ts`)
  }

  private async createAlterMigration(model: ModelInfo, stored: StoredSchemas[string], customName?: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
    const migrationName = customName 
      ? `${timestamp}_${customName}` 
      : `${timestamp}_alter_${model.tableName}_table`
    
    const operations = MigrationGenerator.generateSchemaDiff(
      model.tableName,
      stored.schema,
      model.schema
    )

    if (operations.length === 0) {
      return // No actual changes
    }

    const migrationContent = MigrationGenerator.generateAlterTableMigration(
      operations,
      migrationName
    )

    const migrationPath = path.join(this.options.migrationsDir, `${migrationName}.ts`)
    fs.writeFileSync(migrationPath, migrationContent)
    
    console.log(`📝 Created migration: ${migrationName}.ts`)
  }

  private async createDropTableMigration(stored: StoredSchemas[string]): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
    const migrationName = `${timestamp}_drop_${stored.tableName}_table`
    
    const migrationContent = `import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('${stored.tableName}')
}

export async function down(knex: Knex): Promise<void> {
  // Recreate table - you may need to adjust this based on your needs
  return knex.schema.createTable('${stored.tableName}', (table) => {
    // Add table definition here if you want to support rollback
    table.comment('Table was recreated - adjust schema as needed')
  })
}
`

    const migrationPath = path.join(this.options.migrationsDir, `${migrationName}.ts`)
    fs.writeFileSync(migrationPath, migrationContent)
    
    console.log(`📝 Created migration: ${migrationName}.ts`)
  }

  private async watchModels(): Promise<void> {
    console.log(`👀 Watching ${this.options.modelsDir} for changes...`)
    
    // Simple file watching - in production you might want to use chokidar
    setInterval(async () => {
      try {
        await this.generateMigrations()
      } catch (error) {
        console.error('❌ Error during watch cycle:', error)
      }
    }, 5000) // Check every 5 seconds
  }

  private async initializeProject(): Promise<void> {
    console.log('🚀 Initializing knex-modeling project...')
    
    // Create all configured directories
    const directories = [
      { path: this.options.modelsDir, name: 'models' },
      { path: this.options.migrationsDir, name: 'migrations' },
      { path: this.options.interfacesDir, name: 'interfaces' }
    ]

    for (const dir of directories) {
      if (!fs.existsSync(dir.path)) {
        fs.mkdirSync(dir.path, { recursive: true })
        console.log(`📁 Created ${dir.name} directory: ${dir.path}`)
      }
    }

    // Create example model
    const exampleModelPath = path.join(this.options.modelsDir, 'Default.ts')
    if (!fs.existsSync(exampleModelPath)) {
      const exampleModel = `import { createModel, defineSchema } from 'knex-modeling'

/**
 * Default Model Example - Shows the basic structure of a knex-modeling schema
 * 
 * This example demonstrates:
 * - Basic field types (string, integer, boolean, timestamp, etc.)
 * - Field constraints (required, unique, nullable, maxLength)
 * - Default values and special defaults (now, uuid_generate_v4())
 * - Primary keys and indexes
 * - Automatic timestamp management
 */
export const defaultSchema = defineSchema({
  // Primary key - auto-incrementing integer
  id: { type: 'increments', primary: true },
  
  // Text fields with constraints
  name: { type: 'string', required: true, maxLength: 255 },
  email: { type: 'string', unique: true, required: true, maxLength: 255 },
  description: { type: 'text', nullable: true },
  
  // Numeric fields
  age: { type: 'integer', nullable: true },
  price: { type: 'decimal', precision: 10, scale: 2, nullable: true },
  
  // Boolean field with default
  isActive: { type: 'boolean', defaultTo: true },
  
  // Enum field
  status: { type: 'enum', values: ['pending', 'active', 'inactive'], defaultTo: 'pending' },
  
  // UUID field
  uuid: { type: 'uuid', defaultTo: 'uuid_generate_v4()' },
  
  // Timestamp fields with automatic management
  created_at: { type: 'timestamp', defaultTo: 'now' },
  updated_at: { type: 'timestamp', defaultTo: 'now' }
})

export const Default = createModel({
  schema: defaultSchema,
  tableName: 'defaults'
})
`
      fs.writeFileSync(exampleModelPath, exampleModel)
      console.log(`📄 Created example model: ${exampleModelPath}`)
    }

    // Create config file
    const configPath = path.join(process.cwd(), 'knex-modeling.config.js')
    if (!fs.existsSync(configPath)) {
      const configContent = `module.exports = {
  modelsDir: './src/models',
  migrationsDir: './migrations',
  // Add other configuration options here
}
`
      fs.writeFileSync(configPath, configContent)
      console.log(`⚙️  Created config file: ${configPath}`)
    }

    console.log('✅ Project initialized successfully!')
    console.log('')
    console.log('Next steps:')
    console.log('1. Define your models in the models directory')
    console.log('2. Run "npx knex-modeling generate-migration" to create migrations')
    console.log('3. Run your migrations with Knex CLI')
  }

  /**
   * Generate knex-modeling schemas from existing migrations
   */
  private async generateSchemasFromMigrations(): Promise<void> {
    console.log('🔄 Generating schemas from existing migrations...')
    
    const generator = new SchemaGenerator()
    
    // Check if migrations directory exists
    if (!fs.existsSync(this.options.migrationsDir)) {
      console.error(`❌ Migrations directory not found: ${this.options.migrationsDir}`)
      console.log('💡 Tip: Use --migrations-dir to specify a different location')
      return
    }

    try {
      // First, preview what will be generated
      const { tables, views } = await generator.previewGeneration(this.options.migrationsDir)
      
      if (views.length > 0) {
        console.log(`👁️  Found ${views.length} database view(s) (will be skipped):`)
        views.forEach(({ viewName, migrationFile }) => {
          console.log(`    📄 ${viewName} (in ${migrationFile})`)
        })
        console.log('')
      }
      
      if (tables.length === 0) {
        console.log('ℹ️  No tables found in migrations')
        return
      }

      console.log('📋 Found the following tables:')
      tables.forEach(({ tableName, columns }) => {
        console.log(`  📊 ${tableName} (${columns.length} columns): ${columns.join(', ')}`)
      })

      // Generate the schemas
      const models = await generator.generateSchemasFromMigrations({
        migrationsDir: this.options.migrationsDir,
        modelsDir: this.options.modelsDir,
        overwrite: this.hasFlag('--overwrite'),
        createDirectories: true
      })

      console.log(`🎉 Successfully generated ${models.length} model(s)!`)
      
      if (models.length > 0) {
        console.log('📝 Generated files:')
        models.forEach(model => {
          console.log(`  ✅ ${model.filePath}`)
        })
        
        // Auto-generate interfaces
        console.log('🔧 Auto-generating TypeScript interfaces...')
        await this.interfaceGenerator.generateMissingInterfaces(this.options.modelsDir)
      }

    } catch (error) {
      console.error('❌ Error generating schemas from migrations:', error)
      throw error
    }
  }

  /**
   * Show current configuration
   */
  private showConfig(): void {
    console.log('⚙️  Current Configuration:')
    console.log('')
    console.log(`Models Directory:     ${this.options.modelsDir}`)
    console.log(`Migrations Directory: ${this.options.migrationsDir}`)
    console.log(`Interfaces Directory: ${this.options.interfacesDir}`)
    console.log(`Config File:          ${this.options.configFile || 'knex-modeling.config.js'}`)
    console.log('')
  }

  /**
   * Check if a CLI flag exists
   */
  private hasFlag(flagName: string): boolean {
    return process.argv.includes(flagName)
  }

}

// Helper function to get argument values
function getArgValue(argName: string): string | undefined {
  const args = process.argv.slice(2)
  const argIndex = args.indexOf(argName)
  
  if (argIndex !== -1 && argIndex + 1 < args.length) {
    return args[argIndex + 1]
  }
  
  return undefined
}

// Show CLI help
function showHelp(): void {
  console.log(`
🔧 Knex Modeling CLI

Usage: npx knex-modeling <command> [options]

Commands:
  init                           Initialize a new knex-modeling project
  generate-migration             Generate migrations from model changes (auto-generates interfaces)
  generate-schema                Generate a new model schema file
  generate-interfaces            Generate TypeScript interfaces from model schemas
  generate-all                   Generate both migrations and interfaces
  generate-schemas-from-migrations Generate knex-modeling schemas from existing migrations
  watch                          Watch models and auto-generate migrations + interfaces
  config                         Show current configuration

Options:
  --models-dir <path>      Models directory (default: ./src/models)
  --migrations-dir <path>  Migrations directory (default: ./migrations)
  --interfaces-dir <path>  Interfaces directory (default: ./types)
  --config <path>          Config file path (default: ./knex-modeling.config.js)
  --name <name>            Custom name for migration or schema (generate-migration, generate-schema)
  --overwrite              Overwrite existing model files (for generate-schemas-from-migrations)

Examples:
  npx knex-modeling init
  npx knex-modeling generate-migration
  npx knex-modeling generate-migration --name "add_user_preferences"
  npx knex-modeling generate-schema --name "Product"
  npx knex-modeling generate-interfaces
  npx knex-modeling generate-all
  npx knex-modeling generate-schemas-from-migrations
  npx knex-modeling generate-schemas-from-migrations --overwrite
  npx knex-modeling generate-migration --models-dir ./models
  npx knex-modeling generate-interfaces --interfaces-dir ./types
  npx knex-modeling watch
  npx knex-modeling config
`)
}

// CLI Entry point
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  // Handle special commands first
  if (command === '--help' || command === 'help') {
    showHelp()
    return
  }

  if (command === 'config') {
    const configManager = new ConfigManager()
    configManager.showConfig()
    return
  }

  // Handle init command specially - it needs to create directories before validation
  if (command === 'init') {
    const configManager = new ConfigManager(getArgValue('--config'))
    const cliArgs: Partial<KnexModelingConfig> = {
      modelsDir: getArgValue('--models-dir'),
      migrationsDir: getArgValue('--migrations-dir'),
      interfacesDir: getArgValue('--interfaces-dir')
    }
    
    // Get config but skip validation for init
    const options = configManager.mergeWithArgs(configManager.loadConfig(), cliArgs)
    const cli = new KnexModelingCLI(options)
    
    try {
      await cli.run('init')
      return
    } catch (error) {
      console.error('❌ CLI Error:', error)
      process.exit(1)
    }
  }

  // For all other commands, use normal validation flow
  const configManager = new ConfigManager(getArgValue('--config'))
  const cliArgs: Partial<KnexModelingConfig> = {
    modelsDir: getArgValue('--models-dir'),
    migrationsDir: getArgValue('--migrations-dir'),
    interfacesDir: getArgValue('--interfaces-dir')
  }
  
  const options = configManager.getConfig(cliArgs)

  // Parse command line arguments
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i]
    const value = args[i + 1]

    switch (flag) {
      case '--models-dir':
        options.modelsDir = value
        break
      case '--migrations-dir':
        options.migrationsDir = value
        break
      case '--config':
        options.configFile = value
        break
    }
  }

  // Load config file if exists
  const configPath = options.configFile || './knex-modeling.config.js'
  if (fs.existsSync(configPath)) {
    try {
      const config = require(path.resolve(configPath))
      Object.assign(options, config)
    } catch (error) {
      console.warn('⚠️  Could not load config file:', error)
    }
  }

  const cli = new KnexModelingCLI(options)
  
  // Get custom name from --name flag
  const customName = getArgValue('--name')
  
  try {
    await cli.run(command || 'help', customName)
  } catch (error) {
    console.error('❌ CLI Error:', error)
    process.exit(1)
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main()
}

export { KnexModelingCLI, main } 