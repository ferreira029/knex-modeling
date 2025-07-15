# Development Setup Guide

Complete development environment setup for knex-modeling with professional CI/CD pipeline.

## 🚀 Quick Setup

```bash
# Clone and setup
git clone https://github.com/your-username/knex-modeling.git
cd knex-modeling
npm install

# Install dependencies and setup hooks
npm run prepare

# Validate everything works
npm run validate
```

## 📦 Build System

### ESBuild Integration

The project uses **ESBuild** for optimized bundling:

```bash
# Development build (TypeScript only)
npm run build:tsc

# Production build (TypeScript + ESBuild minification)
npm run build

# Watch mode for development
npm run build:dev
```

**Bundle outputs:**
- `dist/cli.js` - Regular CLI build
- `dist/cli.min.js` - Minified CLI (60% smaller)
- `dist/index.min.js` - Minified library (production optimized)

### Bundle Analysis

View bundle sizes after build:
```bash
npm run build
# Shows: cli.min.js: 45KB, index.min.js: 32KB
```

## 🔍 Code Quality

### ESLint + TypeScript

Comprehensive linting with TypeScript-specific rules:

```bash
# Check code quality
npm run lint

# Auto-fix issues
npm run lint:fix

# Type checking only
npm run typecheck
```

**Configured rules:**
- TypeScript strict mode
- Consistent code style
- Security best practices
- Import/export validation

### Testing with Jest

Full test suite with coverage reporting:

```bash
# Run tests
npm test

# CI tests with coverage
npm run test:ci

# Watch mode
npm test -- --watch
```

**Coverage thresholds:**
- Lines: 70%
- Functions: 70%
- Branches: 70%
- Statements: 70%

## 🎯 Git Hooks (Husky)

Automated quality gates prevent bad commits:

### Pre-commit Hook
```bash
# Runs automatically on git commit
🔍 Running pre-commit checks...
✅ Type checking passed
✅ Linting passed  
✅ Tests passed
✅ Pre-commit checks passed!
```

### Pre-push Hook
```bash
# Runs automatically on git push
🚀 Running pre-push checks...
⚠️  Pushing to main branch - running full validation...
✅ Main branch validation passed!
```

**Branch-specific validation:**
- **Main branch**: Full validation (typecheck + lint + test + build)
- **Feature branches**: Basic validation (typecheck + test)

## 🚀 Release Management

### Manual Release Commands

```bash
# Patch release (1.0.0 → 1.0.1)
npm run release

# Minor release (1.0.0 → 1.1.0)  
npm run release:minor

# Major release (1.0.0 → 2.0.0)
npm run release:major

# Beta release
npm run publish:beta
```

### Version Management

```bash
# Bump version only (no publish)
npm run version:patch
npm run version:minor
npm run version:major

# Validate version format
npm run ci:version-check
```

## 🤖 GitHub Actions

### CI Workflow (`.github/workflows/ci.yml`)

**Triggers:** Push to main/develop, Pull Requests

**Jobs:**
1. **Test & Build** (Node 16, 18, 20)
   - Install dependencies
   - Validate package version
   - Run type checking
   - Run linting
   - Run tests with coverage
   - Build project
   - Upload artifacts

2. **Security Audit**
   - Dependency vulnerability scan
   - Production security check

3. **Bundle Analysis**
   - Build optimization tracking
   - Size reporting in PR comments

### Release Workflow (`.github/workflows/release.yml`)

**Triggers:** 
- Tags starting with `v*`
- Manual workflow dispatch

**Features:**
- Automated version bumping
- NPM publishing with proper tags
- GitHub release creation
- Changelog generation
- Asset uploads

**Manual Release:**
```bash
# Via GitHub UI: Actions → Release & Publish → Run workflow
# Select: patch/minor/major + latest/beta/alpha
```

## 🛠️ Development Commands

### Daily Development
```bash
# Start development mode
npm run build:dev

# Run tests in watch mode
npm test -- --watch

# Check everything before commit
npm run validate
```

### Pre-Release Checklist
```bash
# 1. Validate everything
npm run validate

# 2. Build production bundles
npm run build

# 3. Check bundle sizes
ls -la dist/*.min.js

# 4. Version bump
npm run version:patch

# 5. Push with tags
git push origin main --follow-tags
```

## 📋 Project Structure

```
knex-modeling/
├── src/                    # Source code
├── dist/                   # Built files
├── scripts/                # Build scripts
│   ├── build.js           # ESBuild configuration
│   └── version-check.js   # Version validation
├── tests/                  # Test files
├── .github/workflows/      # GitHub Actions
├── .husky/                 # Git hooks
├── package.json           # Dependencies & scripts
├── tsconfig.json          # TypeScript config
├── jest.config.js         # Test configuration
├── .eslintrc.js           # Linting rules
└── .npmrc                 # NPM configuration
```

## 🔧 Configuration Files

### ESLint (`.eslintrc.js`)
- TypeScript-specific rules
- Code quality enforcement
- Import/export validation
- Consistent styling

### Jest (`jest.config.js`)
- Coverage reporting
- TypeScript transformation
- Custom matchers
- Global setup/teardown

### NPM (`.npmrc`)
- Security audit settings
- Performance optimizations
- Publishing configuration

## 🚦 Quality Gates

### Commit Requirements
- ✅ All tests pass
- ✅ No linting errors
- ✅ TypeScript compilation
- ✅ Coverage thresholds met

### Release Requirements
- ✅ Version validation
- ✅ Security audit pass
- ✅ Bundle size analysis
- ✅ Full test suite
- ✅ Documentation updates

## 🔄 Continuous Integration

### Automated Workflows

1. **On Pull Request:**
   - Run full CI pipeline
   - Comment bundle analysis
   - Block merge if checks fail

2. **On Main Branch Push:**
   - Run extended validation
   - Security scanning
   - Performance benchmarks

3. **On Version Tag:**
   - Automated NPM publish
   - GitHub release creation
   - Documentation updates

### Branch Protection

Recommended GitHub branch protection rules:
- Require PR reviews
- Require status checks
- Require up-to-date branches
- No force pushes to main

## 📊 Monitoring

### Build Metrics
- Bundle size tracking
- Test coverage trends
- Performance benchmarks
- Security audit results

### Release Metrics
- NPM download statistics
- GitHub release analytics
- Issue/PR resolution time
- User feedback tracking

## 🎉 Ready for Production

This setup provides:
- ✅ **Professional CI/CD pipeline**
- ✅ **Automated quality gates**
- ✅ **Optimized bundle delivery**
- ✅ **Comprehensive testing**
- ✅ **Security monitoring**
- ✅ **Release automation**

Start developing with confidence! 🚀 