# knex-modeling

A TypeScript modeling library that extends Knex for better typing and easier database modeling with automated migrations and interfaces.

[![NPM Version](https://img.shields.io/npm/v/knex-modeling)](https://www.npmjs.com/package/knex-modeling)
[![CI Status](https://github.com/your-username/knex-modeling/workflows/CI/badge.svg)](https://github.com/your-username/knex-modeling/actions)
[![Coverage](https://codecov.io/gh/your-username/knex-modeling/branch/main/graph/badge.svg)](https://codecov.io/gh/your-username/knex-modeling)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎯 **Type-Safe Modeling**: Full TypeScript support with automatic type inference
- 🚀 **Automated Migrations**: Generate migrations from schema changes
- 🔧 **CLI Tools**: Powerful command-line interface for development
- 📝 **Interface Generation**: Automatic TypeScript interface creation
- 🔄 **Schema Evolution**: Safe schema alterations with rollback support
- 📦 **Lightweight**: Optimized bundle size with ESBuild
- 🛡️ **Production Ready**: Comprehensive testing and CI/CD pipeline

## Quick Start

### Installation

```bash
npm install knex-modeling
# or
yarn add knex-modeling
```

### Initialize Project

```bash
npx knex-modeling init
```

### Create a Model

```bash
npx knex-modeling generate-schema --name "User"
```

### Generate Migration

```bash
npx knex-modeling generate-migration
```

## Usage

### Basic Model Definition

```typescript
import { createModel, defineSchema } from 'knex-modeling'

const userSchema = defineSchema({
  id: { type: 'increments', primary: true },
  name: { type: 'string', required: true, maxLength: 255 },
  email: { type: 'string', unique: true, required: true },
  age: { type: 'integer', nullable: true },
  isActive: { type: 'boolean', defaultTo: true },
  createdAt: { type: 'timestamp', defaultTo: 'now' },
  updatedAt: { type: 'timestamp', defaultTo: 'now' }
})

export const User = createModel({
  schema: userSchema,
  tableName: 'users'
})
```

### Using the Model

```typescript
// Create
const user = await User.create({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
})

// Find
const users = await User.findAll()
const user = await User.findById(1)

// Update
await User.update({ id: 1 }, { age: 31 })

// Delete
await User.destroy({ id: 1 })

// Complex queries with joins
const results = await User
  .complexQuery({
    select: ['users.*', 'profiles.bio'],
    joins: [
      { table: 'profiles', on: 'users.id = profiles.user_id' }
    ],
    where: { 'users.isActive': true }
  })
```

## CLI Commands

### Project Management
```bash
# Initialize new project
npx knex-modeling init

# Generate new schema
npx knex-modeling generate-schema --name "Product"

# Show configuration
npx knex-modeling config
```

### Migration Management
```bash
# Generate migration from model changes
npx knex-modeling generate-migration

# Generate with custom name
npx knex-modeling generate-migration --name "add_user_preferences"

# Generate from existing migrations
npx knex-modeling generate-schemas-from-migrations
```

### Interface Generation
```bash
# Generate TypeScript interfaces
npx knex-modeling generate-interfaces

# Generate everything (migrations + interfaces)
npx knex-modeling generate-all
```

### Development
```bash
# Watch mode for auto-generation
npx knex-modeling watch
```

## Development

### Setup

```bash
git clone https://github.com/your-username/knex-modeling.git
cd knex-modeling
npm install
```

### Development Scripts

```bash
# Build project
npm run build

# Build with watch mode
npm run build:dev

# Run tests
npm test

# Run tests with coverage
npm run test:ci

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Type checking
npm run typecheck

# Validate everything
npm run validate
```

### Release Management

```bash
# Patch version (1.0.0 -> 1.0.1)
npm run release

# Minor version (1.0.0 -> 1.1.0)
npm run release:minor

# Major version (1.0.0 -> 2.0.0)
npm run release:major

# Beta release
npm run publish:beta
```

## CI/CD Pipeline

The project includes a comprehensive CI/CD pipeline:

- **✅ Automated Testing**: Unit tests with coverage reporting
- **🔍 Code Quality**: ESLint + TypeScript strict checking
- **🛡️ Security Audits**: Automated dependency vulnerability scanning
- **📦 Bundle Analysis**: Size optimization tracking
- **🚀 Auto-Release**: Automated NPM publishing on version tags
- **🔄 Pre-commit Hooks**: Quality gates before commits

### GitHub Actions

- **CI Workflow**: Runs on every PR and push
- **Release Workflow**: Auto-publishes to NPM
- **Security Workflow**: Daily security audits

## Schema Types

### Supported Column Types

```typescript
const schema = defineSchema({
  // Numbers
  id: { type: 'increments', primary: true },
  count: { type: 'integer' },
  price: { type: 'decimal', precision: 10, scale: 2 },
  rating: { type: 'float' },
  
  // Text
  name: { type: 'string', maxLength: 255 },
  description: { type: 'text' },
  
  // Dates
  createdAt: { type: 'timestamp', defaultTo: 'now' },
  birthDate: { type: 'date' },
  
  // Other
  isActive: { type: 'boolean', defaultTo: true },
  metadata: { type: 'json' },
  tags: { type: 'jsonb' },
  status: { type: 'enum', values: ['pending', 'active', 'inactive'] },
  uuid: { type: 'uuid', defaultTo: 'uuid_generate_v4()' }
})
```

### Column Modifiers

```typescript
const schema = defineSchema({
  email: { 
    type: 'string', 
    unique: true,      // UNIQUE constraint
    required: true,    // NOT NULL
    maxLength: 255,    // VARCHAR(255)
    index: true        // CREATE INDEX
  },
  bio: { 
    type: 'text', 
    nullable: true,    // Allow NULL
    comment: 'User biography'
  },
  score: {
    type: 'integer',
    defaultTo: 0       // DEFAULT 0
  }
})
```

## Migration Features

### Safe Schema Evolution

- **Automatic Grouping**: Multiple column operations in single `ALTER TABLE`
- **Rollback Support**: Complete down migrations with original definitions
- **Type Safety**: No invalid Knex operations generated
- **Data Preservation**: Smart alteration detection prevents data loss

### Generated Migration Example

```typescript
// UP: Add columns and modify existing
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.string('phone', 20).nullable()
    table.text('bio').nullable()
    table.string('name', 500).notNullable().alter() // Safe length increase
  })
}

// DOWN: Reverse all changes
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.string('name', 255).notNullable().alter()
    table.dropColumn('bio')
    table.dropColumn('phone')
  })
}
```

## Configuration

### Project Configuration

```javascript
// knex-modeling.config.js
module.exports = {
  modelsDir: './src/models',
  migrationsDir: './migrations',
  interfacesDir: './interfaces'
}
```

### TypeScript Configuration

The project includes optimized TypeScript configuration for both development and production builds.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Write tests for new features
- Update documentation
- Follow semantic versioning

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📝 [Documentation](https://github.com/your-username/knex-modeling/wiki)
- 🐛 [Report Issues](https://github.com/your-username/knex-modeling/issues)
- 💬 [Discussions](https://github.com/your-username/knex-modeling/discussions)
- 📦 [NPM Package](https://www.npmjs.com/package/knex-modeling) 