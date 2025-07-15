import * as fs from 'fs'
import * as path from 'path'
import { MigrationParser, ParsedMigration, ParsedView } from './MigrationParser'
import { ColumnDefinition } from './types'

export interface GenerateSchemaOptions {
  migrationsDir: string
  modelsDir: string
  overwrite?: boolean
  createDirectories?: boolean
}

export interface GeneratedModel {
  tableName: string
  modelName: string
  schemaName: string
  filePath: string
  content: string
}

export class SchemaGenerator {
  private parser: MigrationParser

  constructor() {
    this.parser = new MigrationParser()
  }

  /**
   * Generate all schemas from migrations directory
   */
  async generateSchemasFromMigrations(options: GenerateSchemaOptions): Promise<GeneratedModel[]> {
    const { migrationsDir, modelsDir, overwrite = false, createDirectories = true } = options

    // Parse all migrations including views
    console.log(`🔍 Parsing migrations from: ${migrationsDir}`)
    const { migrations, views } = await this.parser.parseMigrationsWithViews(migrationsDir)
    
    // Inform about found views
    if (views.length > 0) {
      console.log(`👁️  Found ${views.length} database view(s) (skipped - not converted to models):`)
      views.forEach(view => {
        console.log(`    📄 ${view.viewName} (in ${view.migrationFile})`)
      })
      console.log('')
    }
    
    if (migrations.length === 0) {
      console.log('ℹ️  No table migrations found to process')
      return []
    }

    // Group migrations by table
    const groupedMigrations = this.parser.groupMigrationsByTable(migrations)
    
    // Create models directory if needed
    if (createDirectories && !fs.existsSync(modelsDir)) {
      fs.mkdirSync(modelsDir, { recursive: true })
      console.log(`✅ Created models directory: ${modelsDir}`)
    }

    const generatedModels: GeneratedModel[] = []

    // Generate a model file for each table
    for (const [tableName, tableMigrations] of Object.entries(groupedMigrations)) {
      const model = await this.generateModelFromMigrations(
        tableName,
        tableMigrations,
        modelsDir,
        overwrite
      )
      
      if (model) {
        generatedModels.push(model)
      }
    }

    // Generate index file
    if (generatedModels.length > 0) {
      this.generateModelsIndex(modelsDir, generatedModels)
    }

    console.log(`🎉 Generated ${generatedModels.length} model(s) from migrations`)
    return generatedModels
  }

  /**
   * Generate a single model file from table migrations
   */
  private async generateModelFromMigrations(
    tableName: string,
    migrations: ParsedMigration[],
    modelsDir: string,
    overwrite: boolean
  ): Promise<GeneratedModel | null> {
    // Merge all migrations for this table
    const mergedColumns = this.parser.mergeTableMigrations(migrations)
    
    if (Object.keys(mergedColumns).length === 0) {
      console.warn(`⚠️  No columns found for table: ${tableName}`)
      return null
    }

    // Generate model and schema names
    const modelName = this.toPascalCase(tableName)
    const schemaName = `${this.toCamelCase(tableName)}Schema`
    const fileName = `${modelName}.ts`
    const filePath = path.join(modelsDir, fileName)

    // Check if file exists and overwrite flag
    if (fs.existsSync(filePath) && !overwrite) {
      console.log(`ℹ️  Skipping ${fileName} (already exists, use --overwrite to replace)`)
      return null
    }

    // Generate file content
    const content = this.generateModelFileContent(modelName, schemaName, tableName, mergedColumns)

    // Write file
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`✅ Generated model: ${filePath}`)

    return {
      tableName,
      modelName,
      schemaName,
      filePath,
      content
    }
  }

  /**
   * Generate the content of a model file
   */
  private generateModelFileContent(
    modelName: string,
    schemaName: string,
    tableName: string,
    columns: Record<string, ColumnDefinition>
  ): string {
    const schemaDefinition = this.generateSchemaDefinition(columns)
    
    return `// Auto-generated model from migration analysis - DO NOT EDIT MANUALLY
// Generated on: ${new Date().toISOString()}
// Source table: ${tableName}

import { createModel, defineSchema } from 'knex-modeling'

// Schema definition for ${tableName} table
const ${schemaName} = defineSchema({
${schemaDefinition}
})

// Model for ${tableName} table
export const ${modelName} = createModel({
  schema: ${schemaName},
  tableName: '${tableName}'
})

// Export types for convenience
export type ${modelName}Type = typeof ${modelName}
export type ${modelName}Schema = typeof ${schemaName}
`
  }

  /**
   * Generate schema definition string from columns
   */
  private generateSchemaDefinition(columns: Record<string, ColumnDefinition>): string {
    const columnDefinitions: string[] = []

    for (const [columnName, definition] of Object.entries(columns)) {
      const columnDef = this.generateColumnDefinition(columnName, definition)
      columnDefinitions.push(columnDef)
    }

    return columnDefinitions.join(',\n')
  }

  /**
   * Generate a single column definition string
   */
  private generateColumnDefinition(columnName: string, definition: ColumnDefinition): string {
    const properties: string[] = []
    
    // Add type
    properties.push(`type: '${definition.type}'`)

    // Add other properties
    if (definition.primary) properties.push('primary: true')
    if (definition.unique) properties.push('unique: true')
    if (definition.nullable) properties.push('nullable: true')
    if (definition.required) properties.push('required: true')
    if (definition.index) properties.push('index: true')

    // Handle type-specific properties
    const anyDef = definition as any
    if (anyDef.maxLength) properties.push(`maxLength: ${anyDef.maxLength}`)
    if (anyDef.precision) properties.push(`precision: ${anyDef.precision}`)
    if (anyDef.scale) properties.push(`scale: ${anyDef.scale}`)
    if (anyDef.values) {
      const valuesStr = anyDef.values.map((v: string) => `'${v}'`).join(', ')
      properties.push(`values: [${valuesStr}]`)
    }

    // Handle default values
    if (definition.defaultTo !== undefined) {
      if (typeof definition.defaultTo === 'string') {
        if (definition.defaultTo === 'now') {
          properties.push(`defaultTo: 'now'`)
        } else {
          properties.push(`defaultTo: '${definition.defaultTo}'`)
        }
      } else if (typeof definition.defaultTo === 'boolean') {
        properties.push(`defaultTo: ${definition.defaultTo}`)
      } else if (typeof definition.defaultTo === 'number') {
        properties.push(`defaultTo: ${definition.defaultTo}`)
      }
    }

    // Handle onUpdate
    if (definition.onUpdate) {
      if (definition.onUpdate === 'now') {
        properties.push(`onUpdate: 'now'`)
      } else {
        properties.push(`onUpdate: '${definition.onUpdate}'`)
      }
    }

    // Handle comment
    if (definition.comment) {
      properties.push(`comment: '${definition.comment.replace(/'/g, "\\'")}'`)
    }

    const propertiesStr = properties.join(', ')
    return `  ${columnName}: { ${propertiesStr} }`
  }

  /**
   * Generate models index file
   */
  private generateModelsIndex(modelsDir: string, models: GeneratedModel[]): void {
    const indexPath = path.join(modelsDir, 'index.ts')
    
    const exports = models.map(model => 
      `export { ${model.modelName} } from './${model.modelName}'`
    ).join('\n')

    const typeExports = models.map(model => 
      `export type { ${model.modelName}Type, ${model.modelName}Schema } from './${model.modelName}'`
    ).join('\n')

    const content = `// Auto-generated models index - DO NOT EDIT MANUALLY
// Generated on: ${new Date().toISOString()}

// Model exports
${exports}

// Type exports
${typeExports}

// All models array for convenience
export const allModels = [
${models.map(model => `  ${model.modelName}`).join(',\n')}
]
`

    fs.writeFileSync(indexPath, content, 'utf8')
    console.log(`✅ Generated models index: ${indexPath}`)
  }

  /**
   * Convert string to PascalCase for model names
   */
  private toPascalCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(' ')
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
  }

  /**
   * Convert string to camelCase for schema names
   */
  private toCamelCase(str: string): string {
    const pascalCase = this.toPascalCase(str)
    return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1)
  }

  /**
   * Analyze a single migration file and return parsed information
   */
  async analyzemigration(filePath: string): Promise<ParsedMigration[]> {
    return this.parser.parseMigrationFile(filePath)
  }

  /**
   * Preview what would be generated without writing files
   */
  async previewGeneration(migrationsDir: string): Promise<{ 
    tables: { tableName: string; columns: string[] }[]
    views: { viewName: string; migrationFile: string }[]
  }> {
    const { migrations, views } = await this.parser.parseMigrationsWithViews(migrationsDir)
    const groupedMigrations = this.parser.groupMigrationsByTable(migrations)
    
    const tables: { tableName: string; columns: string[] }[] = []
    
    for (const [tableName, tableMigrations] of Object.entries(groupedMigrations)) {
      const mergedColumns = this.parser.mergeTableMigrations(tableMigrations)
      const columnNames = Object.keys(mergedColumns)
      
      tables.push({
        tableName,
        columns: columnNames
      })
    }
    
    return { 
      tables, 
      views: views.map(v => ({ viewName: v.viewName, migrationFile: v.migrationFile }))
    }
  }
} 