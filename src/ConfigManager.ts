import * as fs from 'fs'
import * as path from 'path'

export interface KnexModelingConfig {
  modelsDir: string
  migrationsDir: string
  interfacesDir: string
  configFile?: string
  watch?: boolean
}

export class ConfigManager {
  private configPath: string
  private defaultConfig: KnexModelingConfig

  constructor(configPath: string = './knex-modeling.config.js') {
    this.configPath = configPath
    this.defaultConfig = {
      modelsDir: './src/models',
      migrationsDir: './migrations',
      interfacesDir: './interfaces'
    }
  }

  /**
   * Load configuration from file or return defaults
   */
  loadConfig(): KnexModelingConfig {
    if (fs.existsSync(this.configPath)) {
      try {
        // Clear require cache to get fresh config
        delete require.cache[require.resolve(path.resolve(this.configPath))]
        const fileConfig = require(path.resolve(this.configPath))
        
        return {
          ...this.defaultConfig,
          ...fileConfig
        }
      } catch (error) {
        console.warn(`⚠️  Could not load config from ${this.configPath}:`, error)
        return this.defaultConfig
      }
    }

    return this.defaultConfig
  }

  /**
   * Save configuration to file
   */
  saveConfig(config: Partial<KnexModelingConfig>): void {
    const fullConfig = {
      ...this.defaultConfig,
      ...config
    }

    const configContent = `// Knex Modeling Configuration
// Generated on: ${new Date().toISOString()}

module.exports = {
  // Directory containing your model files
  modelsDir: '${fullConfig.modelsDir}',
  
  // Directory for Knex migrations
  migrationsDir: '${fullConfig.migrationsDir}',
  
  // Directory for auto-generated TypeScript interfaces
  interfacesDir: '${fullConfig.interfacesDir}',
  
  // Watch mode settings (optional)
  watch: ${fullConfig.watch || false}
}
`

    fs.writeFileSync(this.configPath, configContent, 'utf8')
    console.log(`✅ Configuration saved to ${this.configPath}`)
  }

  /**
   * Create default configuration file
   */
  createDefaultConfig(): void {
    if (fs.existsSync(this.configPath)) {
      console.log(`⚠️  Configuration file already exists: ${this.configPath}`)
      return
    }

    this.saveConfig(this.defaultConfig)
  }

  /**
   * Merge command line arguments with config file
   */
  mergeWithArgs(fileConfig: KnexModelingConfig, args: Partial<KnexModelingConfig>): KnexModelingConfig {
    return {
      ...fileConfig,
      ...Object.fromEntries(
        Object.entries(args).filter(([_, value]) => value !== undefined)
      )
    }
  }

  /**
   * Validate configuration paths
   */
  validateConfig(config: KnexModelingConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    // Check if models directory exists
    if (!fs.existsSync(config.modelsDir)) {
      errors.push(`Models directory does not exist: ${config.modelsDir}`)
    }

    // Create migrations directory if it doesn't exist
    if (!fs.existsSync(config.migrationsDir)) {
      try {
        fs.mkdirSync(config.migrationsDir, { recursive: true })
        console.log(`📁 Created migrations directory: ${config.migrationsDir}`)
      } catch (error) {
        errors.push(`Cannot create migrations directory: ${config.migrationsDir}`)
      }
    }

    // Create interfaces directory if it doesn't exist
    if (!fs.existsSync(config.interfacesDir)) {
      try {
        fs.mkdirSync(config.interfacesDir, { recursive: true })
        console.log(`📁 Created interfaces directory: ${config.interfacesDir}`)
      } catch (error) {
        errors.push(`Cannot create interfaces directory: ${config.interfacesDir}`)
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Get configuration with priority: CLI args > config file > defaults
   */
  getConfig(cliArgs: Partial<KnexModelingConfig> = {}): KnexModelingConfig {
    const fileConfig = this.loadConfig()
    const finalConfig = this.mergeWithArgs(fileConfig, cliArgs)
    
    // Validate and create directories
    const validation = this.validateConfig(finalConfig)
    
    if (!validation.isValid) {
      console.error('❌ Configuration validation failed:')
      validation.errors.forEach(error => console.error(`  - ${error}`))
      process.exit(1)
    }

    return finalConfig
  }

  /**
   * Show current configuration
   */
  showConfig(): void {
    const config = this.loadConfig()
    
    console.log(`
📋 Current Knex Modeling Configuration:

📁 Models Directory:     ${config.modelsDir}
📁 Migrations Directory: ${config.migrationsDir}
📁 Interfaces Directory: ${config.interfacesDir}
📄 Config File:          ${this.configPath}

💡 You can customize these paths by:
   1. Using CLI flags: --models-dir, --migrations-dir, --interfaces-dir
   2. Creating ${this.configPath} with your preferences
   3. Running: npx knex-modeling init --interfaces-dir ./custom/path
`)
  }
} 