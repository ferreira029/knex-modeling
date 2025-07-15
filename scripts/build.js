const esbuild = require('esbuild')
const { resolve } = require('path')
const fs = require('fs')
const path = require('path')

const baseConfig = {
  bundle: true,
  minify: true,
  sourcemap: true,
  platform: 'node',
  target: ['node16'],
  external: ['knex'], // Keep knex as external dependency
  logLevel: 'info'
}

async function cleanupUnneededFiles() {
  const distDir = resolve(__dirname, '../dist')
  const files = fs.readdirSync(distDir)
  
  const filesToKeep = [
    // Minified bundles
    'cli.min.js',
    'cli.min.js.map',
    'index.min.js', 
    'index.min.js.map',
    // CLI wrapper
    'cli.prod.js',
    // Type definitions (keep all .d.ts files)
    // Source maps for .d.ts files
  ]
  
  // Keep all .d.ts and .d.ts.map files
  const typesToKeep = files.filter(file => 
    file.endsWith('.d.ts') || file.endsWith('.d.ts.map')
  )
  
  const allFilesToKeep = [...filesToKeep, ...typesToKeep]
  
  console.log('🧹 Cleaning up build artifacts...')
  
  files.forEach(file => {
    if (!allFilesToKeep.includes(file)) {
      const filePath = path.join(distDir, file)
      try {
        fs.unlinkSync(filePath)
        console.log(`   ❌ Removed: ${file}`)
      } catch (error) {
        console.warn(`   ⚠️  Could not remove ${file}:`, error.message)
      }
    } else {
      console.log(`   ✅ Kept: ${file}`)
    }
  })
}

async function build() {
  try {
    console.log('🔨 Building with ESBuild...')

    // Build CLI bundle
    await esbuild.build({
      ...baseConfig,
      entryPoints: [resolve(__dirname, '../src/cli.ts')],
      outfile: resolve(__dirname, '../dist/cli.min.js'),
      minify: true
      // Remove banner - no shebang in minified file since it's required as module
    })

    // Build main library bundle
    await esbuild.build({
      ...baseConfig,
      entryPoints: [resolve(__dirname, '../src/index.ts')],
      outfile: resolve(__dirname, '../dist/index.min.js'),
      minify: true,
      format: 'cjs'
    })

    // Create production CLI wrapper that uses minified version
    const cliContent = `#!/usr/bin/env node
const path = require('path')
const fs = require('fs')

// Use minified version for production
const minifiedPath = path.join(__dirname, 'cli.min.js')

if (fs.existsSync(minifiedPath)) {
  // Load and execute the CLI
  const cli = require(minifiedPath)
  if (cli.main) {
    cli.main()
  }
} else {
  console.error('❌ Minified CLI not found. Please run "npm run build" first.')
  process.exit(1)
}
`

    fs.writeFileSync(resolve(__dirname, '../dist/cli.prod.js'), cliContent)
    fs.chmodSync(resolve(__dirname, '../dist/cli.prod.js'), '755')

    // Clean up unnecessary files for production build
    await cleanupUnneededFiles()

    console.log('✅ ESBuild completed successfully!')
    console.log('📦 Final bundle sizes:')
    
    // Show final bundle sizes
    const files = [
      'dist/cli.min.js',
      'dist/index.min.js'
    ]
    
    files.forEach(file => {
      const filePath = resolve(__dirname, '..', file)
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath)
        const size = (stats.size / 1024).toFixed(2)
        console.log(`   📦 ${file}: ${size} KB`)
      }
    })

    // Show total type definitions kept
    const distDir = resolve(__dirname, '../dist')
    const typeFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.d.ts'))
    console.log(`   📝 Type definitions: ${typeFiles.length} files`)

  } catch (error) {
    console.error('❌ ESBuild failed:', error)
    process.exit(1)
  }
}

build() 