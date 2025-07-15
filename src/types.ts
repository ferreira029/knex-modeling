import type { Knex } from 'knex'

// Supported column types
export type ColumnType = 
  | 'increments'
  | 'bigIncrements'
  | 'integer'
  | 'bigInteger'
  | 'string'
  | 'text'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'time'
  | 'float'
  | 'double'
  | 'decimal'
  | 'binary'
  | 'json'
  | 'jsonb'
  | 'uuid'
  | 'enum'

// Base column definition
export interface BaseColumnDefinition {
  type: ColumnType
  primary?: boolean
  unique?: boolean
  nullable?: boolean
  required?: boolean
  defaultTo?: any
  onUpdate?: any
  index?: boolean
  comment?: string
}

// Extended column definitions for specific types
export interface StringColumnDefinition extends BaseColumnDefinition {
  type: 'string'
  maxLength?: number
}

export interface DecimalColumnDefinition extends BaseColumnDefinition {
  type: 'decimal'
  precision?: number
  scale?: number
}

export interface EnumColumnDefinition extends BaseColumnDefinition {
  type: 'enum'
  values: string[]
}

export interface UuidColumnDefinition extends BaseColumnDefinition {
  type: 'uuid'
  defaultTo?: 'uuid_generate_v4()' | string
}

// Union type for all column definitions
export type ColumnDefinition = 
  | BaseColumnDefinition
  | StringColumnDefinition
  | DecimalColumnDefinition
  | EnumColumnDefinition
  | UuidColumnDefinition

// Schema definition type
export type SchemaDefinition = Record<string, ColumnDefinition>

// Helper type to convert schema to TypeScript types
export type SchemaToType<T extends SchemaDefinition> = {
  [K in keyof T]: ColumnToTypeScript<T[K]>
} & {
  [K in keyof T as T[K] extends { nullable: true } | { required: false }
    ? K
    : never
  ]?: ColumnToTypeScript<T[K]>
}

// Helper type to map column type to TypeScript type
type ColumnToTypeScript<T extends ColumnDefinition> = 
  T extends { type: 'increments' | 'bigIncrements' | 'integer' | 'bigInteger' }
    ? number
    : T extends { type: 'string' | 'text' | 'uuid' }
    ? string
    : T extends { type: 'boolean' }
    ? boolean
    : T extends { type: 'date' | 'datetime' | 'timestamp' | 'time' }
    ? Date
    : T extends { type: 'float' | 'double' | 'decimal' }
    ? number
    : T extends { type: 'json' | 'jsonb' }
    ? any
    : T extends { type: 'binary' }
    ? Buffer
    : T extends { type: 'enum', values: infer V }
    ? V extends readonly (infer U)[]
      ? U
      : never
    : any

// Create input type - excludes auto-generated fields and handles optional/required properly
export type CreateInput<T extends SchemaDefinition> = {
  // Required fields (not nullable, not auto-generated, no default)
  [K in keyof T as T[K] extends { type: 'increments' | 'bigIncrements' }
    ? never
    : T[K] extends { nullable: true }
    ? never
    : T[K] extends { required: false }
    ? never
    : T[K] extends { defaultTo: any }
    ? never
    : K
  ]: ColumnToTypeScript<T[K]>
} & {
  // Optional fields (nullable, has default, or explicitly optional)
  [K in keyof T as T[K] extends { type: 'increments' | 'bigIncrements' }
    ? never
    : T[K] extends { nullable: true }
    ? K
    : T[K] extends { required: false }
    ? K
    : T[K] extends { defaultTo: any }
    ? K
    : never
  ]?: ColumnToTypeScript<T[K]>
}

// Query result types
export type QueryResult<T> = T[]
export type SingleResult<T> = T | undefined

// Model configuration
export interface ModelConfig {
  tableName: string
  primaryKey?: string
  timestamps?: boolean
  softDeletes?: boolean
}

// Migration operations
export type MigrationOperation = 
  | { type: 'createTable'; tableName: string; schema: SchemaDefinition }
  | { type: 'dropTable'; tableName: string }
  | { type: 'addColumn'; tableName: string; columnName: string; definition: ColumnDefinition }
  | { type: 'dropColumn'; tableName: string; columnName: string; oldDefinition?: ColumnDefinition }
  | { 
      type: 'alterColumn'; 
      tableName: string; 
      columnName: string; 
      definition: ColumnDefinition;
      oldDefinition?: ColumnDefinition;
      alterationType?: 'alter' | 'raw' | 'recreate';
    } 