import type { Knex } from 'knex'
import { SchemaDefinition, ColumnDefinition, MigrationOperation } from './types'

export class MigrationGenerator {
  /**
   * Generate a Knex table builder from schema definition
   */
  static buildTable(
    table: Knex.CreateTableBuilder, 
    schema: SchemaDefinition,
    tableName: string
  ): void {
    for (const [columnName, definition] of Object.entries(schema)) {
      this.addColumn(table, columnName, definition)
    }
  }

  /**
   * Add a single column to table builder
   */
  private static addColumn(
    table: Knex.CreateTableBuilder,
    columnName: string,
    definition: ColumnDefinition
  ): void {
    let column: Knex.ColumnBuilder

    // Create column based on type
    switch (definition.type) {
      case 'increments':
        column = table.increments(columnName)
        break
      case 'bigIncrements':
        column = table.bigIncrements(columnName)
        break
      case 'integer':
        column = table.integer(columnName)
        break
      case 'bigInteger':
        column = table.bigInteger(columnName)
        break
      case 'string':
        const stringDef = definition as any
        column = stringDef.maxLength 
          ? table.string(columnName, stringDef.maxLength)
          : table.string(columnName)
        break
      case 'text':
        column = table.text(columnName)
        break
      case 'boolean':
        column = table.boolean(columnName)
        break
      case 'date':
        column = table.date(columnName)
        break
      case 'datetime':
        column = table.datetime(columnName)
        break
      case 'timestamp':
        column = table.timestamp(columnName)
        break
      case 'time':
        column = table.time(columnName)
        break
      case 'float':
        column = table.float(columnName)
        break
      case 'double':
        column = table.double(columnName)
        break
      case 'decimal':
        const decimalDef = definition as any
        column = decimalDef.precision && decimalDef.scale
          ? table.decimal(columnName, decimalDef.precision, decimalDef.scale)
          : table.decimal(columnName)
        break
      case 'binary':
        column = table.binary(columnName)
        break
      case 'json':
        column = table.json(columnName)
        break
      case 'jsonb':
        column = table.jsonb(columnName)
        break
      case 'uuid':
        column = table.uuid(columnName)
        break
      case 'enum':
        const enumDef = definition as any
        column = table.enum(columnName, enumDef.values)
        break
      default:
        throw new Error(`Unsupported column type: ${(definition as any).type}`)
    }

    // Apply column modifiers
    if (definition.primary) {
      column.primary()
    }
    
    if (definition.unique) {
      column.unique()
    }
    
    if (definition.nullable) {
      column.nullable()
    } else if (definition.required !== false && !definition.primary) {
      column.notNullable()
    }
    
    if (definition.defaultTo !== undefined) {
      if (definition.defaultTo === 'now') {
        // Will use raw SQL in migration generation
        column.defaultTo(definition.defaultTo)
      } else if (definition.defaultTo === 'uuid_generate_v4()') {
        // Will use raw SQL in migration generation  
        column.defaultTo(definition.defaultTo)
      } else {
        column.defaultTo(definition.defaultTo)
      }
    }
    
    if (definition.index) {
      column.index()
    }
    
    if (definition.comment) {
      column.comment(definition.comment)
    }

    // Handle onUpdate for timestamps
    if (definition.onUpdate) {
      if (definition.onUpdate === 'now') {
        // This will need to be handled differently per database
        // For now, we'll add a comment about it
        column.comment(`AUTO UPDATE: ${definition.onUpdate}`)
      }
    }
  }

  /**
   * Generate migration file content for creating a table
   */
  static generateCreateTableMigration(
    tableName: string,
    schema: SchemaDefinition,
    migrationName?: string
  ): string {
    const name = migrationName || `create_${tableName}_table`
    
    return `import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('${tableName}', (table) => {
${this.generateTableBuilder(schema, '    ')}
  })
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTableIfExists('${tableName}')
}
`
  }

  /**
   * Generate table builder code as string
   */
  private static generateTableBuilder(schema: SchemaDefinition, indent: string = ''): string {
    const lines: string[] = []
    
    for (const [columnName, definition] of Object.entries(schema)) {
      lines.push(this.generateColumnBuilder(columnName, definition, indent))
    }
    
    return lines.join('\n')
  }

  /**
   * Generate migration operations for schema changes
   */
  static generateSchemaDiff(
    tableName: string,
    oldSchema: SchemaDefinition,
    newSchema: SchemaDefinition
  ): MigrationOperation[] {
    const operations: MigrationOperation[] = []
    
    // Find new columns
    for (const [columnName, definition] of Object.entries(newSchema)) {
      if (!oldSchema[columnName]) {
        operations.push({
          type: 'addColumn',
          tableName,
          columnName,
          definition
        })
      }
    }
    
    // Find removed columns
    for (const columnName of Object.keys(oldSchema)) {
      if (!newSchema[columnName]) {
        operations.push({
          type: 'dropColumn',
          tableName,
          columnName,
          oldDefinition: oldSchema[columnName] // Include original definition for down migration
        })
      }
    }
    
    // Find altered columns with detailed comparison
    for (const [columnName, newDefinition] of Object.entries(newSchema)) {
      const oldDefinition = oldSchema[columnName]
      if (oldDefinition && this.hasColumnChanged(oldDefinition, newDefinition)) {
        // Determine the type of alteration needed
        const alterationType = this.determineAlterationType(oldDefinition, newDefinition)
        
        operations.push({
          type: 'alterColumn',
          tableName,
          columnName,
          definition: newDefinition,
          oldDefinition,
          alterationType
        })
      }
    }
    
    return operations
  }

  /**
   * Determine if a column has actually changed
   */
  private static hasColumnChanged(oldDef: ColumnDefinition, newDef: ColumnDefinition): boolean {
    // Create normalized copies for comparison
    const normalizedOld = { ...oldDef }
    const normalizedNew = { ...newDef }
    
    // Remove properties that don't affect the database schema
    delete (normalizedOld as any).comment
    delete (normalizedNew as any).comment
    
    return JSON.stringify(normalizedOld) !== JSON.stringify(normalizedNew)
  }

  /**
   * Determine the best approach for altering a column
   */
  private static determineAlterationType(oldDef: ColumnDefinition, newDef: ColumnDefinition): 'alter' | 'raw' | 'recreate' {
    // Safe alterations that can use .alter()
    const safeAlterations = this.canUseAlterMethod(oldDef, newDef)
    if (safeAlterations) {
      return 'alter'
    }
    
    // Complex constraint changes that need RAW queries
    const needsRaw = this.needsRawQuery(oldDef, newDef)
    if (needsRaw) {
      return 'raw'
    }
    
    // Fallback to recreate (should be rare)
    return 'recreate'
  }

  /**
   * Check if the column change can safely use .alter()
   */
  private static canUseAlterMethod(oldDef: ColumnDefinition, newDef: ColumnDefinition): boolean {
    // Same base type
    if (oldDef.type !== newDef.type) {
      return false
    }
    
    // Check for safe string length increases
    if (oldDef.type === 'string' && newDef.type === 'string') {
      const oldLength = (oldDef as any).maxLength || 255
      const newLength = (newDef as any).maxLength || 255
      return newLength >= oldLength // Only allow increases
    }
    
    // Check for safe decimal precision/scale changes
    if (oldDef.type === 'decimal' && newDef.type === 'decimal') {
      const oldPrecision = (oldDef as any).precision || 8
      const newPrecision = (newDef as any).precision || 8
      const oldScale = (oldDef as any).scale || 2
      const newScale = (newDef as any).scale || 2
      return newPrecision >= oldPrecision && newScale >= oldScale
    }
    
    // Check for nullable changes (can always make nullable, but not vice versa without data check)
    if (oldDef.nullable === false && newDef.nullable === true) {
      return true
    }
    
    // Default value changes are generally safe
    if (oldDef.defaultTo !== newDef.defaultTo && oldDef.type === newDef.type) {
      return true
    }
    
    return false
  }

  /**
   * Check if the column change needs RAW queries
   */
  private static needsRawQuery(oldDef: ColumnDefinition, newDef: ColumnDefinition): boolean {
    // Constraint changes that need RAW
    const constraintChanges = [
      oldDef.unique !== newDef.unique,
      oldDef.primary !== newDef.primary,
      JSON.stringify((oldDef as any).values) !== JSON.stringify((newDef as any).values), // enum values
      oldDef.nullable === true && newDef.nullable === false // making NOT NULL needs data validation
    ]
    
    return constraintChanges.some(changed => changed)
  }

  /**
   * Group operations by table and type for efficient migration generation
   */
  private static groupOperationsByTable(operations: MigrationOperation[]): { 
    tableName: string, 
    operations: MigrationOperation[], 
    canGroup: boolean 
  }[] {
    const tableGroups = new Map<string, MigrationOperation[]>()
    
    // Group operations by table name
    for (const operation of operations) {
      const tableName = operation.tableName
      if (!tableGroups.has(tableName)) {
        tableGroups.set(tableName, [])
      }
      tableGroups.get(tableName)!.push(operation)
    }
    
    // Determine which groups can be combined into single alterTable
    return Array.from(tableGroups.entries()).map(([tableName, ops]) => ({
      tableName,
      operations: ops,
      canGroup: this.canGroupOperations(ops)
    }))
  }

  /**
   * Check if operations can be grouped into a single alterTable
   */
  private static canGroupOperations(operations: MigrationOperation[]): boolean {
    return operations.every(op => {
      // Can group most standard operations
      if (op.type === 'addColumn' || op.type === 'dropColumn') {
        return true
      }
      
      // Can group alter operations that use .alter() method
      if (op.type === 'alterColumn') {
        return op.alterationType === 'alter' || !op.alterationType
      }
      
      return false
    })
  }

  /**
   * Generate grouped alterTable operation
   */
  private static generateGroupedAlterTable(
    tableName: string, 
    operations: MigrationOperation[], 
    direction: 'up' | 'down'
  ): string {
    const columnOperations = operations.map(op => {
      switch (op.type) {
        case 'addColumn':
          if (direction === 'up') {
            return this.generateColumnBuilder(op.columnName, op.definition, '    ')
          } else {
            return `table.dropColumn('${op.columnName}')`
          }
        
        case 'dropColumn':
          if (direction === 'up') {
            return `table.dropColumn('${op.columnName}')`
          } else {
            const oldDef = op.oldDefinition
            if (oldDef) {
              return this.generateColumnBuilder(op.columnName, oldDef, '    ')
            }
            return `// TODO: Add back column '${op.columnName}' with proper definition`
          }
        
        case 'alterColumn':
          if (direction === 'up') {
            return this.generateColumnBuilder(op.columnName, op.definition, '    ', true)
          } else {
            const oldDef = op.oldDefinition
            if (oldDef) {
              return this.generateColumnBuilder(op.columnName, oldDef, '    ', true)
            }
            return `// TODO: Reverse alteration for column '${op.columnName}'`
          }
        
        default:
          return `// Unknown operation: ${(op as any).type}`
      }
    }).filter(op => !op.includes('// TODO:')) // Filter out incomplete operations
    
    if (columnOperations.length === 0) {
      return `// No valid operations for table '${tableName}'`
    }
    
    return `await knex.schema.alterTable('${tableName}', (table) => {
    ${columnOperations.join('\n    ')}
  })`
  }

  /**
   * Generate migration file for schema changes
   */
  static generateAlterTableMigration(
    operations: MigrationOperation[],
    migrationName: string
  ): string {
    if (operations.length === 0) {
      return `import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // No operations to perform
}

export async function down(knex: Knex): Promise<void> {
  // No operations to reverse
}
`
    }

    const tableGroups = this.groupOperationsByTable(operations)
    
    // Generate UP operations
    const upOperations: string[] = []
    for (const group of tableGroups) {
      if (group.canGroup && group.operations.length > 1) {
        // Group multiple operations into single alterTable
        upOperations.push(this.generateGroupedAlterTable(group.tableName, group.operations, 'up'))
      } else {
        // Generate individual operations (for RAW queries, etc.)
        upOperations.push(...group.operations.map(op => this.generateMigrationOperation(op, 'up')))
      }
    }
    
    // Generate DOWN operations (reverse order)
    const downOperations: string[] = []
    const reversedGroups = [...tableGroups].reverse()
    for (const group of reversedGroups) {
      if (group.canGroup && group.operations.length > 1) {
        // Group multiple operations into single alterTable (with reversed operations)
        const reversedOps = [...group.operations].reverse()
        downOperations.push(this.generateGroupedAlterTable(group.tableName, reversedOps, 'down'))
      } else {
        // Generate individual operations (for RAW queries, etc.)
        const reversedOps = [...group.operations].reverse()
        downOperations.push(...reversedOps.map(op => this.generateMigrationOperation(op, 'down')))
      }
    }
    
    return `import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  ${upOperations.join('\n\n  ')}
}

export async function down(knex: Knex): Promise<void> {
  ${downOperations.join('\n\n  ')}
}
`
  }

  /**
   * Generate single migration operation code
   */
  private static generateMigrationOperation(operation: MigrationOperation, direction: 'up' | 'down'): string {
    switch (operation.type) {
      case 'addColumn':
        if (direction === 'up') {
          return `await knex.schema.alterTable('${operation.tableName}', (table) => {
    ${this.generateColumnBuilder(operation.columnName, operation.definition, '    ')}
  })`
        } else {
          return `await knex.schema.alterTable('${operation.tableName}', (table) => {
    table.dropColumn('${operation.columnName}')
  })`
        }
      
      case 'dropColumn':
        if (direction === 'up') {
          return `await knex.schema.alterTable('${operation.tableName}', (table) => {
    table.dropColumn('${operation.columnName}')
  })`
        } else {
          // For down migration, we'd need the original column definition
          const oldDef = operation.oldDefinition
          if (oldDef) {
            return `await knex.schema.alterTable('${operation.tableName}', (table) => {
    ${this.generateColumnBuilder(operation.columnName, oldDef, '    ')}
  })`
          }
          return `// TODO: Add back column '${operation.columnName}' with proper definition`
        }
      
      case 'alterColumn':
        const alterType = operation.alterationType || 'alter'
        const oldDef = operation.oldDefinition
        
        if (direction === 'up') {
          switch (alterType) {
            case 'alter':
              return `await knex.schema.alterTable('${operation.tableName}', (table) => {
    ${this.generateColumnBuilder(operation.columnName, operation.definition, '    ', true)}
  })`
            
            case 'raw':
              return this.generateRawAlterOperation(operation.tableName, operation.columnName, oldDef!, operation.definition)
            
            case 'recreate':
              return `// WARNING: This operation may cause data loss - consider manual migration
  await knex.schema.alterTable('${operation.tableName}', (table) => {
    table.dropColumn('${operation.columnName}')
  })
  await knex.schema.alterTable('${operation.tableName}', (table) => {
    ${this.generateColumnBuilder(operation.columnName, operation.definition, '    ')}
  })`
            
            default:
              return `await knex.schema.alterTable('${operation.tableName}', (table) => {
    ${this.generateColumnBuilder(operation.columnName, operation.definition, '    ', true)}
  })`
          }
        } else {
          // Down migration - reverse the change
          if (oldDef) {
            switch (alterType) {
              case 'alter':
                return `await knex.schema.alterTable('${operation.tableName}', (table) => {
    ${this.generateColumnBuilder(operation.columnName, oldDef, '    ', true)}
  })`
              
              case 'raw':
                return this.generateRawAlterOperation(operation.tableName, operation.columnName, operation.definition, oldDef)
              
              default:
                return `await knex.schema.alterTable('${operation.tableName}', (table) => {
    ${this.generateColumnBuilder(operation.columnName, oldDef, '    ', true)}
  })`
            }
          }
          return `// TODO: Reverse alteration for column '${operation.columnName}'`
        }
      
      default:
        return `// Unknown operation: ${(operation as any).type}`
    }
  }

  /**
   * Generate RAW SQL for complex column alterations
   */
  private static generateRawAlterOperation(
    tableName: string,
    columnName: string,
    oldDef: ColumnDefinition,
    newDef: ColumnDefinition
  ): string {
    const operations: string[] = []
    
    // Handle unique constraint changes
    if (oldDef.unique !== newDef.unique) {
      if (newDef.unique) {
        operations.push(`await knex.schema.alterTable('${tableName}', (table) => {
    table.unique(['${columnName}'])
  })`)
      } else {
        operations.push(`await knex.raw('ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${tableName}_${columnName}_unique')`)
      }
    }
    
    // Handle NOT NULL constraint changes
    if (oldDef.nullable === true && newDef.nullable === false) {
      operations.push(`// WARNING: Adding NOT NULL constraint - ensure no NULL values exist
  await knex.raw('UPDATE ${tableName} SET ${columnName} = ? WHERE ${columnName} IS NULL', [${JSON.stringify(newDef.defaultTo || '')}])`)
      operations.push(`await knex.raw('ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL')`)
    } else if (oldDef.nullable === false && newDef.nullable === true) {
      operations.push(`await knex.raw('ALTER TABLE ${tableName} ALTER COLUMN ${columnName} DROP NOT NULL')`)
    }
    
    // Handle enum value changes
    if ((oldDef as any).values && (newDef as any).values) {
      const oldValues = (oldDef as any).values
      const newValues = (newDef as any).values
      if (JSON.stringify(oldValues) !== JSON.stringify(newValues)) {
        const valuesStr = newValues.map((v: string) => `'${v}'`).join(', ')
        operations.push(`// WARNING: Changing enum values - ensure data compatibility
  await knex.raw('ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE varchar(255)')`)
        operations.push(`await knex.raw('ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${tableName}_${columnName}_enum USING ${columnName}::${tableName}_${columnName}_enum')`)
      }
    }
    
    if (operations.length === 0) {
      operations.push(`// No RAW operations needed for this change`)
    }
    
    return operations.join('\n  ')
  }

  /**
   * Generate column builder code as string
   */
  private static generateColumnBuilder(
    columnName: string,
    definition: ColumnDefinition,
    indent: string = '',
    isAlter: boolean = false
  ): string {
    let builder = ''
    
    // Generate base column type
    switch (definition.type) {
      case 'increments':
        builder = `table.increments('${columnName}')`
        break
      case 'bigIncrements':
        builder = `table.bigIncrements('${columnName}')`
        break
      case 'integer':
        builder = `table.integer('${columnName}')`
        break
      case 'bigInteger':
        builder = `table.bigInteger('${columnName}')`
        break
      case 'string':
        const maxLength = (definition as any).maxLength
        builder = maxLength 
          ? `table.string('${columnName}', ${maxLength})`
          : `table.string('${columnName}')`
        break
      case 'text':
        builder = `table.text('${columnName}')`
        break
      case 'boolean':
        builder = `table.boolean('${columnName}')`
        break
      case 'date':
        builder = `table.date('${columnName}')`
        break
      case 'datetime':
        builder = `table.datetime('${columnName}')`
        break
      case 'timestamp':
        builder = `table.timestamp('${columnName}')`
        break
      case 'time':
        builder = `table.time('${columnName}')`
        break
      case 'float':
        builder = `table.float('${columnName}')`
        break
      case 'double':
        builder = `table.double('${columnName}')`
        break
      case 'decimal':
        const precision = (definition as any).precision
        const scale = (definition as any).scale
        if (precision && scale) {
          builder = `table.decimal('${columnName}', ${precision}, ${scale})`
        } else {
          builder = `table.decimal('${columnName}')`
        }
        break
      case 'binary':
        builder = `table.binary('${columnName}')`
        break
      case 'json':
        builder = `table.json('${columnName}')`
        break
      case 'jsonb':
        builder = `table.jsonb('${columnName}')`
        break
      case 'uuid':
        builder = `table.uuid('${columnName}')`
        break
      case 'enum':
        const values = (definition as any).values
        if (values && Array.isArray(values)) {
          const valuesStr = values.map(v => `'${v}'`).join(', ')
          builder = `table.enum('${columnName}', [${valuesStr}])`
        } else {
          builder = `table.string('${columnName}') // TODO: Define enum values`
        }
        break
      default:
        builder = `table.string('${columnName}') // Unknown type: ${(definition as any).type}`
    }
    
    // Add modifiers
    if (definition.primary && !['increments', 'bigIncrements'].includes(definition.type)) {
      builder += '.primary()'
    }
    
    if (definition.unique) {
      builder += '.unique()'
    }
    
    if (definition.nullable) {
      builder += '.nullable()'
    } else if (definition.required || (!definition.nullable && definition.nullable !== undefined)) {
      builder += '.notNullable()'
    }
    
    if (definition.defaultTo !== undefined) {
      if (typeof definition.defaultTo === 'string' && definition.defaultTo === 'now') {
        builder += '.defaultTo(knex.fn.now())'
      } else if (typeof definition.defaultTo === 'string') {
        builder += `.defaultTo('${definition.defaultTo}')`
      } else {
        builder += `.defaultTo(${definition.defaultTo})`
      }
    }
    
    // Note: onUpdate is not supported in Knex migrations
    // This functionality should be implemented via database triggers or application logic
    if (definition.onUpdate) {
      // Add a comment to indicate onUpdate was requested but not implemented
      // in the migration due to Knex limitations
    }
    
    if (definition.index) {
      builder += '.index()'
    }
    
    // Add .alter() for column alterations
    if (isAlter) {
      builder += '.alter()'
    }
    
    return `${indent}${builder}`
  }
} 