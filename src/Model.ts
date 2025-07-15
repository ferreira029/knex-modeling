import { Knex } from 'knex'
import { SchemaDefinition, SchemaToType, QueryResult, SingleResult, CreateInput } from './types'

// Interfaces for complex queries and joins
export interface JoinDefinition {
  table: string
  on: string
  type?: 'inner' | 'left' | 'right' | 'full'
  alias?: string
}

export interface RelationDefinition {
  model: typeof Model
  foreignKey: string
  localKey?: string
  type?: 'inner' | 'left' | 'right'
  alias?: string
}

export interface ComplexQueryOptions {
  select?: string[]
  joins?: JoinDefinition[]
  relations?: RelationDefinition[]
  where?: Record<string, any>
  orderBy?: Array<{ column: string, direction: 'asc' | 'desc' }>
  limit?: number
  offset?: number
  groupBy?: string[]
  having?: Record<string, any>
}

export interface QueryBuilder<T> {
  query: Knex.QueryBuilder
  execute(): Promise<T[]>
  first(): Promise<T | undefined>
  count(): Promise<number>
}

export abstract class Model<T extends SchemaDefinition = any> {
  // Static properties that must be defined by subclasses
  static schema: SchemaDefinition
  static tableName: string
  static primaryKey: string = 'id'
  static knexInstanceName: string = 'default'
  
  // Multiple Knex instances support
  public static knexInstances: Map<string, Knex> = new Map()

  // Set the default Knex instance
  static setKnex(knex: Knex): void {
    this.knexInstances.set('default', knex)
  }

  // Set a named Knex instance
  static setNamedKnex(name: string, knex: Knex): void {
    this.knexInstances.set(name, knex)
  }

  // Get the Knex instance for this model
  static getKnex<T extends typeof Model>(this: T): Knex {
    const instanceName = this.knexInstanceName || 'default'
    const knexInstance = this.knexInstances.get(instanceName)
    
    if (!knexInstance) {
      throw new Error(
        `Knex instance '${instanceName}' not found. ` +
        `Call Model.setKnex(knex) or Model.setNamedKnex('${instanceName}', knex) first.`
      )
    }
    
    return knexInstance
  }

  // Get a specific named Knex instance
  static getNamedKnex(name: string): Knex {
    const knexInstance = this.knexInstances.get(name)
    
    if (!knexInstance) {
      throw new Error(`Knex instance '${name}' not found. Call Model.setNamedKnex('${name}', knex) first.`)
    }
    
    return knexInstance
  }

  // List all available Knex instance names
  static getAvailableKnexInstances(): string[] {
    return Array.from(this.knexInstances.keys())
  }



  // Get query builder for this model
  static query<T extends typeof Model>(this: T): Knex.QueryBuilder {
    return this.getKnex()(this.tableName)
  }

  // Find by primary key
  static async findById<T extends typeof Model>(
    this: T, 
    id: string | number
  ): Promise<SingleResult<SchemaToType<T['schema']>>> {
    const result = await this.query().where(this.primaryKey, id).first()
    return result as SingleResult<SchemaToType<T['schema']>>
  }

  // Find by token (useful for authentication)
  static async findByToken<T extends typeof Model>(
    this: T,
    token: string,
    tokenField: string = 'token'
  ): Promise<SingleResult<SchemaToType<T['schema']>>> {
    const result = await this.query().where(tokenField, token).first()
    return result as SingleResult<SchemaToType<T['schema']>>
  }

  // Find multiple records
  static async findMany<T extends typeof Model>(
    this: T,
    conditions: Partial<SchemaToType<T['schema']>> = {}
  ): Promise<QueryResult<SchemaToType<T['schema']>>> {
    let query = this.query()
    
    for (const [key, value] of Object.entries(conditions)) {
      query = query.where(key, value)
    }
    
    const results = await query
    return results as QueryResult<SchemaToType<T['schema']>>
  }

  // Find one record
  static async findOne<T extends typeof Model>(
    this: T,
    conditions: Partial<SchemaToType<T['schema']>>
  ): Promise<SingleResult<SchemaToType<T['schema']>>> {
    let query = this.query()
    
    for (const [key, value] of Object.entries(conditions)) {
      query = query.where(key, value)
    }
    
    const result = await query.first()
    return result as SingleResult<SchemaToType<T['schema']>>
  }

  // Create a new record
  static async create<T extends typeof Model>(
    this: T,
    data: CreateInput<T['schema']>
  ): Promise<SchemaToType<T['schema']>> {
    const [result] = await this.query().insert(data).returning('*')
    return result as SchemaToType<T['schema']>
  }

  // Update records
  static async update<T extends typeof Model>(
    this: T,
    conditions: Partial<SchemaToType<T['schema']>>,
    data: Partial<SchemaToType<T['schema']>>
  ): Promise<QueryResult<SchemaToType<T['schema']>>> {
    let query = this.query()
    
    for (const [key, value] of Object.entries(conditions)) {
      query = query.where(key, value)
    }
    
    const results = await query.update(data).returning('*')
    return results as QueryResult<SchemaToType<T['schema']>>
  }

  // Update by ID
  static async updateById<T extends typeof Model>(
    this: T,
    id: string | number,
    data: Partial<SchemaToType<T['schema']>>
  ): Promise<SingleResult<SchemaToType<T['schema']>>> {
    const [result] = await this.query()
      .where(this.primaryKey, id)
      .update(data)
      .returning('*')
    return result as SingleResult<SchemaToType<T['schema']>>
  }

  // Delete records
  static async delete<T extends typeof Model>(
    this: T,
    conditions: Partial<SchemaToType<T['schema']>>
  ): Promise<number> {
    let query = this.query()
    
    for (const [key, value] of Object.entries(conditions)) {
      query = query.where(key, value)
    }
    
    return await query.del()
  }

  // Delete by ID
  static async deleteById<T extends typeof Model>(
    this: T,
    id: string | number
  ): Promise<number> {
    return await this.query().where(this.primaryKey, id).del()
  }

  // Get all records
  static async all<T extends typeof Model>(
    this: T
  ): Promise<QueryResult<SchemaToType<T['schema']>>> {
    const results = await this.query()
    return results as QueryResult<SchemaToType<T['schema']>>
  }

  // Count records
  static async count<T extends typeof Model>(
    this: T,
    conditions: Partial<SchemaToType<T['schema']>> = {}
  ): Promise<number> {
    let query = this.query()
    
    for (const [key, value] of Object.entries(conditions)) {
      query = query.where(key, value)
    }
    
    const [{ count }] = await query.count('* as count')
    return parseInt(count as string, 10)
  }

  // Check if record exists
  static async exists<T extends typeof Model>(
    this: T,
    conditions: Partial<SchemaToType<T['schema']>>
  ): Promise<boolean> {
    const count = await this.count(conditions)
    return count > 0
  }

  // Advanced query methods that return the query builder for chaining
  static where<T extends typeof Model>(
    this: T,
    column: keyof SchemaToType<T['schema']>,
    operator: string,
    value: any
  ): Knex.QueryBuilder {
    return this.query().where(column as string, operator, value)
  }

  static whereIn<T extends typeof Model>(
    this: T,
    column: keyof SchemaToType<T['schema']>,
    values: any[]
  ): Knex.QueryBuilder {
    return this.query().whereIn(column as string, values)
  }

  static orderBy<T extends typeof Model>(
    this: T,
    column: keyof SchemaToType<T['schema']>,
    direction: 'asc' | 'desc' = 'asc'
  ): Knex.QueryBuilder {
    return this.query().orderBy(column as string, direction)
  }

  static limit<T extends typeof Model>(
    this: T,
    limit: number
  ): Knex.QueryBuilder {
    return this.query().limit(limit)
  }

  static offset<T extends typeof Model>(
    this: T,
    offset: number
  ): Knex.QueryBuilder {
    return this.query().offset(offset)
  }

  // ========== COMPLEX QUERY METHODS ==========

  // Basic join method
  static join<T extends typeof Model>(
    this: T,
    table: string,
    on: string,
    type: 'inner' | 'left' | 'right' | 'full' = 'inner'
  ): Knex.QueryBuilder {
    const query = this.query()
    const [leftSide, rightSide] = on.split('=').map(s => s.trim())
    
    switch (type) {
      case 'left':
        return query.leftJoin(table, leftSide, rightSide)
      case 'right':
        return query.rightJoin(table, leftSide, rightSide)
      case 'full':
        return query.fullOuterJoin(table, leftSide, rightSide)
      default:
        return query.innerJoin(table, leftSide, rightSide)
    }
  }

  // Specific join methods for better readability
  static innerJoin<T extends typeof Model>(
    this: T,
    table: string,
    on: string
  ): Knex.QueryBuilder {
    const [leftSide, rightSide] = on.split('=').map(s => s.trim())
    return this.query().innerJoin(table, leftSide, rightSide)
  }

  static leftJoin<T extends typeof Model>(
    this: T,
    table: string,
    on: string
  ): Knex.QueryBuilder {
    const [leftSide, rightSide] = on.split('=').map(s => s.trim())
    return this.query().leftJoin(table, leftSide, rightSide)
  }

  static rightJoin<T extends typeof Model>(
    this: T,
    table: string,
    on: string
  ): Knex.QueryBuilder {
    const [leftSide, rightSide] = on.split('=').map(s => s.trim())
    return this.query().rightJoin(table, leftSide, rightSide)
  }

  static fullJoin<T extends typeof Model>(
    this: T,
    table: string,
    on: string
  ): Knex.QueryBuilder {
    const [leftSide, rightSide] = on.split('=').map(s => s.trim())
    return this.query().fullOuterJoin(table, leftSide, rightSide)
  }

  // Select specific columns (useful with joins)
  static select<T extends typeof Model>(
    this: T,
    columns: string[]
  ): Knex.QueryBuilder {
    return this.query().select(columns)
  }

  // Select with table prefixes for joins
  static selectFrom<T extends typeof Model>(
    this: T,
    tableColumns: Record<string, string[]>
  ): Knex.QueryBuilder {
    const selectColumns: string[] = []
    
    Object.entries(tableColumns).forEach(([table, columns]) => {
      columns.forEach(column => {
        selectColumns.push(`${table}.${column} as ${table}_${column}`)
      })
    })
    
    return this.query().select(selectColumns)
  }

  // Relation-based joins (automatic based on foreign keys)
  static withRelations<T extends typeof Model>(
    this: T,
    relations: RelationDefinition[]
  ): Knex.QueryBuilder {
    let query = this.query()
    
    relations.forEach(relation => {
      const { model, foreignKey, localKey = this.primaryKey, type = 'left', alias } = relation
      const joinTable = alias || model.tableName
      const leftSide = `${this.tableName}.${localKey}`
      const rightSide = `${joinTable}.${foreignKey}`
      const tableWithAlias = alias ? `${model.tableName} as ${alias}` : model.tableName
      
      switch (type) {
        case 'inner':
          query = query.innerJoin(tableWithAlias, leftSide, rightSide)
          break
        case 'right':
          query = query.rightJoin(tableWithAlias, leftSide, rightSide)
          break
        default:
          query = query.leftJoin(tableWithAlias, leftSide, rightSide)
      }
    })
    
    return query
  }

  // Complex query builder - the main method for advanced queries
  static complexQuery<T extends typeof Model>(
    this: T,
    options: ComplexQueryOptions
  ): QueryBuilder<any> {
    let query = this.query()
    
    // Apply selections
    if (options.select && options.select.length > 0) {
      query = query.select(options.select)
    }
    
    // Apply joins
    if (options.joins) {
      options.joins.forEach(join => {
        const { table, on, type = 'inner', alias } = join
        const joinTable = alias ? `${table} as ${alias}` : table
        const [leftSide, rightSide] = on.split('=').map(s => s.trim())
        
        switch (type) {
          case 'left':
            query = query.leftJoin(joinTable, leftSide, rightSide)
            break
          case 'right':
            query = query.rightJoin(joinTable, leftSide, rightSide)
            break
          case 'full':
            query = query.fullOuterJoin(joinTable, leftSide, rightSide)
            break
          default:
            query = query.innerJoin(joinTable, leftSide, rightSide)
        }
      })
    }
    
    // Apply relation-based joins
    if (options.relations) {
      options.relations.forEach(relation => {
        const { model, foreignKey, localKey = this.primaryKey, type = 'left', alias } = relation
        const joinTable = alias || model.tableName
        const leftSide = `${this.tableName}.${localKey}`
        const rightSide = `${joinTable}.${foreignKey}`
        const tableWithAlias = alias ? `${model.tableName} as ${alias}` : model.tableName
        
        switch (type) {
          case 'inner':
            query = query.innerJoin(tableWithAlias, leftSide, rightSide)
            break
          case 'right':
            query = query.rightJoin(tableWithAlias, leftSide, rightSide)
            break
          default:
            query = query.leftJoin(tableWithAlias, leftSide, rightSide)
        }
      })
    }
    
    // Apply where conditions
    if (options.where) {
      Object.entries(options.where).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          query = query.whereIn(key, value)
        } else if (value === null) {
          query = query.whereNull(key)
        } else {
          query = query.where(key, value)
        }
      })
    }
    
    // Apply order by
    if (options.orderBy) {
      options.orderBy.forEach(({ column, direction }) => {
        query = query.orderBy(column, direction)
      })
    }
    
    // Apply group by
    if (options.groupBy) {
      query = query.groupBy(options.groupBy)
    }
    
    // Apply having conditions
    if (options.having) {
      Object.entries(options.having).forEach(([key, value]) => {
        query = query.having(key, '=', value)
      })
    }
    
    // Apply limit and offset
    if (options.limit) {
      query = query.limit(options.limit)
    }
    
    if (options.offset) {
      query = query.offset(options.offset)
    }
    
    // Return a query builder with helpful methods
    return {
      query,
      async execute() {
        return await query
      },
      async first() {
        return await query.first()
      },
      async count() {
        const [{ count }] = await query.count('* as count')
        return parseInt(count as string, 10)
      }
    }
  }

  // Quick join helpers for common scenarios
  static joinUsers<T extends typeof Model>(
    this: T,
    userIdColumn: string = 'user_id',
    type: 'inner' | 'left' = 'left'
  ): Knex.QueryBuilder {
    const leftSide = `${this.tableName}.${userIdColumn}`
    const rightSide = 'users.id'
    return type === 'inner' 
      ? this.query().innerJoin('users', leftSide, rightSide)
      : this.query().leftJoin('users', leftSide, rightSide)
  }

  static joinCategories<T extends typeof Model>(
    this: T,
    categoryIdColumn: string = 'category_id',
    type: 'inner' | 'left' = 'left'
  ): Knex.QueryBuilder {
    const leftSide = `${this.tableName}.${categoryIdColumn}`
    const rightSide = 'categories.id'
    return type === 'inner' 
      ? this.query().innerJoin('categories', leftSide, rightSide)
      : this.query().leftJoin('categories', leftSide, rightSide)
  }
} 