import * as fs from 'fs'
import * as path from 'path'
import { ColumnDefinition, SchemaDefinition } from './types'

export interface ParsedMigration {
  tableName: string
  columns: Record<string, ColumnDefinition>
  operation: 'create' | 'alter' | 'drop'
  migrationFile: string
  alterOperations?: AlterOperation[]
}

export interface AlterOperation {
  type: 'addColumn' | 'dropColumn' | 'modifyColumn'
  columnName: string
  definition?: ColumnDefinition
}

export interface ParsedView {
  viewName: string
  migrationFile: string
  query?: string
}

export interface ParsedColumn {
  name: string
  type: string
  modifiers: string[]
  parameters: (string | number)[]
}

export class MigrationParser {
  /**
   * Parse all migration files in a directory
   */
  async parseMigrationsDirectory(migrationsDir: string): Promise<ParsedMigration[]> {
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`)
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'))
      .sort() // Process in chronological order

    const migrations: ParsedMigration[] = []

    for (const file of files) {
      const filePath = path.join(migrationsDir, file)
      const parsed = await this.parseMigrationFile(filePath)
      migrations.push(...parsed)
    }

    return migrations
  }

  /**
   * Parse a single migration file
   */
  async parseMigrationFile(filePath: string): Promise<ParsedMigration[]> {
    const content = fs.readFileSync(filePath, 'utf8')
    const migrations: ParsedMigration[] = []

    // Extract createTable operations
    const createTableMatches = this.extractCreateTableOperations(content)
    for (const match of createTableMatches) {
      const columns = this.parseTableDefinition(match.definition)
      migrations.push({
        tableName: match.tableName,
        columns: this.convertColumnsToSchema(columns),
        operation: 'create',
        migrationFile: path.basename(filePath)
      })
    }

    // Extract alterTable operations
    const alterTableMatches = this.extractAlterTableOperations(content)
    for (const match of alterTableMatches) {
      const columns = this.parseTableDefinition(match.definition)
      const alterOperations = this.parseAlterOperations(match.definition)
      
      migrations.push({
        tableName: match.tableName,
        columns: this.convertColumnsToSchema(columns),
        operation: 'alter',
        migrationFile: path.basename(filePath),
        alterOperations
      })
    }
    
    return migrations
  }

  /**
   * Parse all migration files and also detect views
   */
  async parseMigrationsWithViews(migrationsDir: string): Promise<{ migrations: ParsedMigration[]; views: ParsedView[] }> {
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found: ${migrationsDir}`)
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'))
      .sort() // Process in chronological order

    const migrations: ParsedMigration[] = []
    const views: ParsedView[] = []

    for (const file of files) {
      const filePath = path.join(migrationsDir, file)
      const content = fs.readFileSync(filePath, 'utf8')
      
      // Parse tables
      const parsedMigrations = await this.parseMigrationFile(filePath)
      migrations.push(...parsedMigrations)
      
      // Parse views
      const parsedViews = this.extractViewOperations(content, file)
      views.push(...parsedViews)
    }

    return { migrations, views }
  }

  /**
   * Extract createView operations from migration content (only from exports.up)
   */
  private extractViewOperations(content: string, migrationFile: string): ParsedView[] {
    // First extract the exports.up function
    const upFunctionMatch = content.match(/exports\.up\s*=\s*function[^{]*\{([\s\S]*?)\}\s*(?=exports\.down|$)/m)
    if (!upFunctionMatch) {
      return []
    }
    
    const upContent = upFunctionMatch[1]
    const createViewRegex = /(?:knex|[a-zA-Z_$][a-zA-Z0-9_$]*)\.schema\.createView\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*function\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\)\s*\{([\s\S]*?)\}\s*\)/g
    const views: ParsedView[] = []
    
    let match
    while ((match = createViewRegex.exec(upContent)) !== null) {
      views.push({
        viewName: match[1],
        migrationFile,
        query: match[2] // Store the view definition for potential future use
      })
    }

    return views
  }

  /**
   * Extract alterTable operations from migration content (only from exports.up)
   */
  private extractAlterTableOperations(content: string): { tableName: string; definition: string }[] {
    // First extract the exports.up function
    const upFunctionMatch = content.match(/exports\.up\s*=\s*function[^{]*\{([\s\S]*?)\}\s*(?=exports\.down|$)/m)
    if (!upFunctionMatch) {
      return []
    }
    
    const upContent = upFunctionMatch[1]
    const alterTableRegex = /(?:knex|[a-zA-Z_$][a-zA-Z0-9_$]*)\.schema\.alterTable\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*function\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\)\s*\{([\s\S]*?)\}\s*\)/g
    const matches: { tableName: string; definition: string }[] = []
    
    let match
    while ((match = alterTableRegex.exec(upContent)) !== null) {
      matches.push({
        tableName: match[1],
        definition: match[2]
      })
    }

    return matches
  }

  /**
   * Parse alter operations from table definition
   */
  private parseAlterOperations(definition: string): AlterOperation[] {
    const operations: AlterOperation[] = []
    const lines = definition.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    
    for (const line of lines) {
      // Check for dropColumn operations
      const dropColumnMatch = line.match(/table\.dropColumn\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/)
      if (dropColumnMatch) {
        operations.push({
          type: 'dropColumn',
          columnName: dropColumnMatch[1]
        })
        continue
      }

      // Check for regular column definitions (addColumn)
      const columnMatch = line.match(/table\.(\w+)\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*([^)]*))?\s*\)(.*)/)
      if (columnMatch) {
        const columnType = columnMatch[1]
        const columnName = columnMatch[2]
        const parameters = columnMatch[3] ? this.parseParameters(columnMatch[3]) : []
        const modifierChain = columnMatch[4] || ''
        const modifiers = this.parseModifiers(modifierChain)

        const parsedColumn: ParsedColumn = {
          name: columnName,
          type: columnType,
          parameters,
          modifiers
        }

        const definition = this.convertColumnToDefinition(parsedColumn)
        if (definition) {
          operations.push({
            type: 'addColumn',
            columnName,
            definition
          })
        }
      }
    }

    return operations
  }

  /**
   * Extract createTable operations from migration content (only from exports.up)
   */
  private extractCreateTableOperations(content: string): { tableName: string; definition: string }[] {
    // First extract the exports.up function
    const upFunctionMatch = content.match(/exports\.up\s*=\s*function[^{]*\{([\s\S]*?)\}\s*(?=exports\.down|$)/m)
    if (!upFunctionMatch) {
      return []
    }
    
    const upContent = upFunctionMatch[1]
    const createTableRegex = /(?:knex|[a-zA-Z_$][a-zA-Z0-9_$]*)\.schema\.createTable\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*function\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\)\s*\{([\s\S]*?)\}\s*\)/g
    const matches: { tableName: string; definition: string }[] = []
    
    let match
    while ((match = createTableRegex.exec(upContent)) !== null) {
      matches.push({
        tableName: match[1],
        definition: match[2]
      })
    }

    return matches
  }

  /**
   * Parse table definition and extract columns
   */
  private parseTableDefinition(definition: string): ParsedColumn[] {
    const columns: ParsedColumn[] = []
    
    // Split by lines and parse each table.* call
    const lines = definition.split('\n').map(line => line.trim()).filter(line => line.length > 0)
    
    for (const line of lines) {
      // Skip index() calls, dropColumn() calls, and other non-column definitions
      if (line.includes('table.index(') || 
          line.includes('table.foreign(') || 
          line.includes('table.primary(') ||
          line.includes('table.dropColumn(')) {
        continue
      }
      
      // Match table.columnType('name') patterns with chained modifiers
      const columnMatch = line.match(/table\.(\w+)\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*([^)]*))?\s*\)(.*)/)
      
      if (columnMatch) {
        const columnType = columnMatch[1]
        const columnName = columnMatch[2]
        const parameters = columnMatch[3] ? this.parseParameters(columnMatch[3]) : []
        const modifierChain = columnMatch[4] || ''
        const modifiers = this.parseModifiers(modifierChain)

        columns.push({
          name: columnName,
          type: columnType,
          parameters,
          modifiers
        })
      }
    }

    return columns
  }

  /**
   * Parse function parameters
   */
  private parseParameters(paramString: string): (string | number)[] {
    if (!paramString.trim()) return []
    
    const params: (string | number)[] = []
    const cleanParam = paramString.trim()
    
    // Handle array parameters (like ['user', 'admin', 'moderator'])
    if (cleanParam.startsWith('[') && cleanParam.endsWith(']')) {
      const arrayContent = cleanParam.slice(1, -1)
      const items = arrayContent.split(',').map(item => {
        const trimmed = item.trim()
        if (trimmed.match(/^['"`][^'"`]*['"`]$/)) {
          return trimmed.slice(1, -1)
        }
        return trimmed
      }).filter(item => item.length > 0)
      
      params.push(...items)
      return params
    }
    
    // Handle simple cases
    if (cleanParam.match(/^\d+$/)) {
      params.push(parseInt(cleanParam, 10))
    } else if (cleanParam.match(/^['"`][^'"`]*['"`]$/)) {
      params.push(cleanParam.slice(1, -1))
    } else if (cleanParam.includes(',')) {
      // Multiple parameters
      const parts = cleanParam.split(',').map(p => p.trim())
      for (const part of parts) {
        if (part.match(/^\d+$/)) {
          params.push(parseInt(part, 10))
        } else if (part.match(/^['"`][^'"`]*['"`]$/)) {
          params.push(part.slice(1, -1))
        } else {
          params.push(part)
        }
      }
    } else {
      params.push(cleanParam)
    }
    
    return params
  }

  /**
   * Parse modifier chain (.notNullable().unique(), etc.)
   */
  private parseModifiers(modifierChain: string): string[] {
    const modifiers: string[] = []
    
    // Match .modifier() patterns
    const modifierRegex = /\.(\w+)\s*\(\s*([^)]*)\s*\)/g
    
    let match
    while ((match = modifierRegex.exec(modifierChain)) !== null) {
      const modifier = match[1]
      const args = match[2] ? match[2].trim() : ''
      
      if (args) {
        modifiers.push(`${modifier}(${args})`)
      } else {
        modifiers.push(modifier)
      }
    }

    return modifiers
  }

  /**
   * Convert parsed columns to knex-modeling schema format
   */
  private convertColumnsToSchema(columns: ParsedColumn[]): Record<string, ColumnDefinition> {
    const schema: Record<string, ColumnDefinition> = {}

    for (const column of columns) {
      const definition = this.convertColumnToDefinition(column)
      if (definition) {
        schema[column.name] = definition
      }
    }

    return schema
  }

  /**
   * Convert a single parsed column to ColumnDefinition
   */
  private convertColumnToDefinition(column: ParsedColumn): ColumnDefinition | null {
    const definition: Partial<ColumnDefinition> = {}

    // Map Knex column types to knex-modeling types
    const typeMapping: Record<string, string> = {
      'increments': 'increments',
      'bigIncrements': 'bigIncrements',
      'integer': 'integer',
      'bigInteger': 'bigInteger',
      'string': 'string',
      'text': 'text',
      'boolean': 'boolean',
      'date': 'date',
      'datetime': 'datetime',
      'timestamp': 'timestamp',
      'time': 'time',
      'float': 'float',
      'double': 'double',
      'decimal': 'decimal',
      'binary': 'binary',
      'json': 'json',
      'jsonb': 'jsonb',
      'uuid': 'uuid',
      'enu': 'enum', // Knex uses 'enu' for enum
      'enum': 'enum'
    }

    const mappedType = typeMapping[column.type]
    if (!mappedType) {
      console.warn(`⚠️  Unknown column type: ${column.type} for column ${column.name}`)
      return null
    }

    definition.type = mappedType as any

    // Handle type-specific parameters
    if (column.type === 'string' && column.parameters.length > 0 && typeof column.parameters[0] === 'number') {
      (definition as any).maxLength = column.parameters[0]
    } else if (column.type === 'decimal' && column.parameters.length >= 2) {
      if (typeof column.parameters[0] === 'number' && typeof column.parameters[1] === 'number') {
        (definition as any).precision = column.parameters[0] as number
        (definition as any).scale = column.parameters[1] as number
      }
    } else if ((column.type === 'enu' || column.type === 'enum') && column.parameters.length > 0) {
      // Handle enum values - they come as individual parameters
      const values: string[] = []
      for (const param of column.parameters) {
        if (typeof param === 'string') {
          values.push(param)
        }
      }
      ;(definition as any).values = values
    }

    // Parse modifiers
    for (const modifier of column.modifiers) {
      this.applyModifierToDefinition(definition, modifier)
    }

    // Handle special cases for auto-increment
    if (column.type === 'increments' || column.type === 'bigIncrements') {
      definition.primary = true
    }

    return definition as ColumnDefinition
  }

  /**
   * Apply a modifier to the column definition
   */
  private applyModifierToDefinition(definition: Partial<ColumnDefinition>, modifier: string): void {
    if (modifier === 'primary') {
      definition.primary = true
    } else if (modifier === 'unique') {
      definition.unique = true
    } else if (modifier === 'notNullable') {
      definition.required = true
    } else if (modifier === 'nullable') {
      definition.nullable = true
    } else if (modifier === 'index') {
      definition.index = true
    } else if (modifier.startsWith('defaultTo(')) {
      // Extract default value
      const match = modifier.match(/defaultTo\((.+)\)/)
      if (match) {
        let defaultValue = match[1].trim()
        
        // Handle special cases
        if (defaultValue === "knex.raw('CURRENT_TIMESTAMP')" || 
            defaultValue === "'CURRENT_TIMESTAMP'" ||
            defaultValue.includes('CURRENT_TIMESTAMP')) {
          definition.defaultTo = 'now'
        } else if (defaultValue.match(/^['"`][^'"`]*['"`]$/)) {
          // String literal
          definition.defaultTo = defaultValue.slice(1, -1)
        } else if (defaultValue === 'true') {
          definition.defaultTo = true
        } else if (defaultValue === 'false') {
          definition.defaultTo = false
        } else if (defaultValue.match(/^\d+$/)) {
          definition.defaultTo = parseInt(defaultValue, 10)
        } else {
          definition.defaultTo = defaultValue
        }
      }
    } else if (modifier.startsWith('comment(')) {
      // Extract comment
      const match = modifier.match(/comment\(['"`]([^'"`]*)['"`]\)/)
      if (match) {
        definition.comment = match[1]
      }
    }
  }

  /**
   * Group migrations by table name, handling multiple operations on same table
   */
  groupMigrationsByTable(migrations: ParsedMigration[]): Record<string, ParsedMigration[]> {
    const grouped: Record<string, ParsedMigration[]> = {}
    
    for (const migration of migrations) {
      if (!grouped[migration.tableName]) {
        grouped[migration.tableName] = []
      }
      grouped[migration.tableName].push(migration)
    }
    
    return grouped
  }

  /**
   * Merge multiple migrations for the same table into a single schema
   */
  mergeTableMigrations(migrations: ParsedMigration[]): Record<string, ColumnDefinition> {
    const mergedColumns: Record<string, ColumnDefinition> = {}
    
    // Process migrations in chronological order (by filename)
    const sortedMigrations = migrations.sort((a, b) => a.migrationFile.localeCompare(b.migrationFile))
    
    for (const migration of sortedMigrations) {
      if (migration.operation === 'create') {
        // Add all columns from create operation
        Object.assign(mergedColumns, migration.columns)
      } else if (migration.operation === 'alter' && migration.alterOperations) {
        // Apply alter operations
        for (const operation of migration.alterOperations) {
          switch (operation.type) {
            case 'addColumn':
              if (operation.definition) {
                mergedColumns[operation.columnName] = operation.definition
              }
              break
            case 'dropColumn':
              delete mergedColumns[operation.columnName]
              break
            case 'modifyColumn':
              if (operation.definition) {
                mergedColumns[operation.columnName] = operation.definition
              }
              break
          }
        }
      }
    }
    
    return mergedColumns
  }
} 