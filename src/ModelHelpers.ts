import { Model } from './Model'
import { SchemaDefinition, SchemaToType, CreateInput } from './types'

/**
 * Helper type that merges Model with schema properties for automatic typing
 */
export type TypedModel<T extends SchemaDefinition> = Model<T> & SchemaToType<T>

/**
 * Create a model class with automatic typing from schema
 * This eliminates the need to manually declare properties
 */
export function createModel<S extends SchemaDefinition>(config: {
  schema: S
  tableName: string
  primaryKey?: string
  knexInstanceName?: string
}) {
  class GeneratedModel extends Model<S> {
    static schema = config.schema
    static tableName = config.tableName
    static primaryKey = config.primaryKey || 'id'
    static knexInstanceName = config.knexInstanceName || 'default'
  }

  // Return with proper typing
  return GeneratedModel as {
    new (): TypedModel<S>
  } & typeof GeneratedModel
}

/**
 * Create a model with automatic interface generation
 * Returns both the model and the interface type
 */
export function createModelWithInterface<S extends SchemaDefinition, ModelName extends string>(config: {
  schema: S
  tableName: string
  modelName: ModelName
  primaryKey?: string
  knexInstanceName?: string
}) {
  const model = createModel(config)
  
  // Create interface type with I{ModelName} pattern
  type InterfaceType = SchemaToType<S>
  type CreateType = CreateInput<S>
  
  return {
    model,
    // Export types for external use
    types: {} as {
      [K in `I${ModelName}`]: InterfaceType
    } & {
      [K in `Create${ModelName}Input`]: CreateType
    } & {
      [K in `Update${ModelName}Data`]: Partial<InterfaceType>
    }
  }
}

/**
 * Define a schema with better type inference
 * Automatically makes schema readonly without needing 'as const'
 */
export function defineSchema<const T extends SchemaDefinition>(schema: T): T {
  return schema
}

/**
 * Utility type for extracting schema type from a model class
 */
export type InferSchemaType<T> = T extends Model<infer S> ? SchemaToType<S> : never 