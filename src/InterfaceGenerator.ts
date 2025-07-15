import * as fs from 'fs'
import * as path from 'path'
import { SchemaDefinition } from './types'

export class InterfaceGenerator {
  private interfacesDir: string

  constructor(interfacesDir: string = 'interfaces') {
    this.interfacesDir = interfacesDir
  }

  /**
   * Convert string to CamelCase removing hyphens, underscores and other separators
   */
  private toCamelCase(str: string): string {
    return str
      // Remove special characters and split by common separators
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(' ')
      .filter(word => word.length > 0)
      .map((word, index) => {
        // Capitalize first letter of each word
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      })
      .join('')
  }

  /**
   * Create the interfaces directory if it doesn't exist
   */
  private ensureInterfacesDir(): void {
    if (!fs.existsSync(this.interfacesDir)) {
      fs.mkdirSync(this.interfacesDir, { recursive: true })
      console.log(`✅ Created interfaces directory: ${this.interfacesDir}`)
    }
  }

  /**
   * Generate interface file for a model
   */
  generateInterface(
    modelName: string,
    schemaVariableName: string,
    schemaDefinition: SchemaDefinition,
    sourceFilePath?: string
  ): string {
    this.ensureInterfacesDir()

    // Convert model name to CamelCase without separators
    const camelCaseModelName = this.toCamelCase(modelName)
    const interfaceName = `I${camelCaseModelName}`
    const fileName = `${interfaceName}.ts`
    const filePath = path.join(this.interfacesDir, fileName)

    // Generate the interface content
    const interfaceContent = this.generateInterfaceContent(
      interfaceName,
      camelCaseModelName,
      schemaVariableName,
      sourceFilePath
    )

    // Write the interface file
    fs.writeFileSync(filePath, interfaceContent, 'utf8')
    
    console.log(`✅ Generated interface: ${filePath}`)
    
    return filePath
  }

  /**
   * Generate the TypeScript interface content
   */
  private generateInterfaceContent(
    interfaceName: string,
    camelCaseModelName: string,
    schemaVariableName: string,
    sourceFilePath?: string
  ): string {
    // Determine import path
    const importPath = sourceFilePath 
      ? this.getRelativeImportPath(sourceFilePath)
      : '../src'

    const content = `// Auto-generated interface - DO NOT EDIT MANUALLY
// Generated on: ${new Date().toISOString()}
// Source schema: ${schemaVariableName}

import { SchemaToType } from '${importPath}'
import { ${schemaVariableName} } from '${sourceFilePath ? this.getRelativeSchemaImportPath(sourceFilePath) : '../models'}'

/**
 * TypeScript interface for ${camelCaseModelName} model
 * Auto-generated from schema definition
 */
export interface ${interfaceName} extends SchemaToType<typeof ${schemaVariableName}> {}

/**
 * Type for creating new ${camelCaseModelName} records
 * Excludes auto-generated fields and includes proper optional/required field handling
 */
export type Create${camelCaseModelName}Input = {
  [K in keyof SchemaToType<typeof ${schemaVariableName}> as 
    // Exclude auto-increment fields
    typeof ${schemaVariableName}[K] extends { type: 'increments' | 'bigIncrements' } ? never :
    // Exclude fields with defaults unless explicitly required
    typeof ${schemaVariableName}[K] extends { defaultTo: any, required: true } ? K :
    typeof ${schemaVariableName}[K] extends { defaultTo: any } ? never :
    // Include required fields
    typeof ${schemaVariableName}[K] extends { required: true } ? K :
    // Exclude nullable fields from required
    typeof ${schemaVariableName}[K] extends { nullable: true } ? never :
    K
  ]: SchemaToType<typeof ${schemaVariableName}>[K]
} & {
  [K in keyof SchemaToType<typeof ${schemaVariableName}> as 
    // Include optional fields
    typeof ${schemaVariableName}[K] extends { type: 'increments' | 'bigIncrements' } ? never :
    typeof ${schemaVariableName}[K] extends { defaultTo: any, required: true } ? never :
    typeof ${schemaVariableName}[K] extends { defaultTo: any } ? K :
    typeof ${schemaVariableName}[K] extends { nullable: true } ? K :
    typeof ${schemaVariableName}[K] extends { required: false } ? K :
    never
  ]?: SchemaToType<typeof ${schemaVariableName}>[K]
}

/**
 * Type for updating ${camelCaseModelName} records
 * All fields are optional for updates
 */
export type Update${camelCaseModelName}Data = Partial<${interfaceName}>

/**
 * Type alias for the complete ${camelCaseModelName} schema
 */
export type ${camelCaseModelName}Schema = typeof ${schemaVariableName}
`

    return content
  }

  /**
   * Get relative import path for knex-modeling types
   */
  private getRelativeImportPath(sourceFilePath: string): string {
    const relativePath = path.relative(this.interfacesDir, path.dirname(sourceFilePath))
    return relativePath ? `${relativePath}/src` : '../src'
  }

  /**
   * Get relative import path for schema
   */
  private getRelativeSchemaImportPath(sourceFilePath: string): string {
    const relativePath = path.relative(this.interfacesDir, sourceFilePath)
    // Remove .ts extension
    return relativePath.replace(/\.ts$/, '')
  }

  /**
   * Check if interface file exists
   */
  interfaceExists(modelName: string): boolean {
    const camelCaseModelName = this.toCamelCase(modelName)
    const fileName = `I${camelCaseModelName}.ts`
    const filePath = path.join(this.interfacesDir, fileName)
    return fs.existsSync(filePath)
  }

  /**
   * Delete interface file
   */
  deleteInterface(modelName: string): boolean {
    const camelCaseModelName = this.toCamelCase(modelName)
    const fileName = `I${camelCaseModelName}.ts`
    const filePath = path.join(this.interfacesDir, fileName)
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log(`🗑️  Deleted interface: ${filePath}`)
      return true
    }
    
    return false
  }

  /**
   * Generate index file for all interfaces
   */
  generateIndexFile(modelNames: string[]): void {
    this.ensureInterfacesDir()
    
    const indexPath = path.join(this.interfacesDir, 'index.ts')
    
    const exports = modelNames.map(modelName => {
      const camelCaseModelName = this.toCamelCase(modelName)
      const interfaceName = `I${camelCaseModelName}`
      return `export type { ${interfaceName}, Create${camelCaseModelName}Input, Update${camelCaseModelName}Data, ${camelCaseModelName}Schema } from './${interfaceName}'`
    }).join('\n')

    const content = `// Auto-generated interface index - DO NOT EDIT MANUALLY
// Generated on: ${new Date().toISOString()}

${exports}

// Re-export all interfaces as a convenience
export type {
${modelNames.map(name => `  I${this.toCamelCase(name)}`).join(',\n')}
} from './interfaces'
`

    fs.writeFileSync(indexPath, content, 'utf8')
    console.log(`✅ Generated interface index: ${indexPath}`)
  }

  /**
   * Scan models directory and generate missing interfaces
   */
  async generateMissingInterfaces(modelsDir: string): Promise<void> {
    if (!fs.existsSync(modelsDir)) {
      console.log(`⚠️  Models directory not found: ${modelsDir}`)
      return
    }

    const modelFiles = fs.readdirSync(modelsDir)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
      .filter(file => !file.startsWith('index'))

    const generatedInterfaces: string[] = []

    for (const file of modelFiles) {
      const filePath = path.join(modelsDir, file)
      const modelName = this.extractModelNameFromFile(filePath)
      
      if (modelName && !this.interfaceExists(modelName)) {
        const schemaInfo = this.extractSchemaFromFile(filePath)
        if (schemaInfo) {
          this.generateInterface(
            modelName,
            schemaInfo.schemaVariableName,
            schemaInfo.schema,
            filePath
          )
          generatedInterfaces.push(modelName)
        }
      }
    }

    if (generatedInterfaces.length > 0) {
      // Get all model names for index generation
      const allModelNames = modelFiles
        .map(file => this.extractModelNameFromFile(path.join(modelsDir, file)))
        .filter(Boolean) as string[]
      
      this.generateIndexFile(allModelNames)
      
      console.log(`🎉 Generated ${generatedInterfaces.length} missing interfaces`)
    } else {
      console.log(`ℹ️  All interfaces are up to date`)
    }
  }

  /**
   * Extract model name from file content or filename
   */
  private extractModelNameFromFile(filePath: string): string | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      
      // Look for createModel calls
      const createModelMatch = content.match(/export\s+const\s+(\w+)\s*=\s*createModel\s*\(/m)
      if (createModelMatch) {
        return createModelMatch[1]
      }

      // Look for class extends Model
      const classMatch = content.match(/export\s+class\s+(\w+)\s+extends\s+Model/m)
      if (classMatch) {
        return classMatch[1]
      }

      // Fallback to filename
      const fileName = path.basename(filePath, path.extname(filePath))
      return fileName.charAt(0).toUpperCase() + fileName.slice(1)
    } catch (error) {
      console.warn(`⚠️  Could not extract model name from ${filePath}:`, error)
      return null
    }
  }

  /**
   * Extract schema definition from file
   */
  private extractSchemaFromFile(filePath: string): { schemaVariableName: string; schema: SchemaDefinition } | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      
      // Look for schema variable definitions
      const schemaMatch = content.match(/const\s+(\w*[Ss]chema)\s*=\s*defineSchema\s*\(/m)
      if (schemaMatch) {
        return {
          schemaVariableName: schemaMatch[1],
          schema: {} as SchemaDefinition // We'll use the variable name for import
        }
      }

      // Look for inline schema in createModel
      const inlineSchemaMatch = content.match(/schema:\s*\{[\s\S]*?\}/m)
      if (inlineSchemaMatch) {
        return {
          schemaVariableName: 'schema', // Generic name for inline schemas
          schema: {} as SchemaDefinition
        }
      }

      return null
    } catch (error) {
      console.warn(`⚠️  Could not extract schema from ${filePath}:`, error)
      return null
    }
  }
} 