const fs = require('fs')
const { resolve } = require('path')

function validateVersion() {
  try {
    console.log('🔍 Validating package version...')
    
    const packageJson = JSON.parse(fs.readFileSync(resolve(__dirname, '../package.json'), 'utf8'))
    const version = packageJson.version
    
    // Validate semantic versioning format
    const semverRegex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
    
    if (!semverRegex.test(version)) {
      console.error('❌ Invalid semantic version format:', version)
      console.error('   Expected format: MAJOR.MINOR.PATCH (e.g., 1.2.3)')
      process.exit(1)
    }
    
    // Validate required fields
    const requiredFields = ['name', 'description', 'main', 'types', 'author', 'license', 'repository']
    const missingFields = requiredFields.filter(field => !packageJson[field])
    
    if (missingFields.length > 0) {
      console.error('❌ Missing required package.json fields:', missingFields.join(', '))
      process.exit(1)
    }
    
    // Validate dependencies versions
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
    const invalidDeps = []
    
    Object.entries(dependencies).forEach(([name, version]) => {
      if (!version.match(/^[\^~]?\d+\.\d+\.\d+/)) {
        invalidDeps.push(`${name}: ${version}`)
      }
    })
    
    if (invalidDeps.length > 0) {
      console.warn('⚠️  Potentially invalid dependency versions:', invalidDeps.join(', '))
    }
    
    // Check if version changed from git
    const { execSync } = require('child_process')
    try {
      const gitVersion = execSync('git show HEAD~1:package.json', { encoding: 'utf8' })
      const previousPackage = JSON.parse(gitVersion)
      
      if (previousPackage.version === version) {
        console.warn('⚠️  Version has not been updated since last commit')
        console.warn('   Consider running: npm run version:patch')
      } else {
        console.log('✅ Version updated:', previousPackage.version, '->', version)
      }
    } catch (error) {
      // Ignore git errors (e.g., first commit)
      console.log('ℹ️  Cannot compare with previous version (first commit or git unavailable)')
    }
    
    console.log('✅ Package version validation passed!')
    console.log(`📦 Package: ${packageJson.name}@${version}`)
    
  } catch (error) {
    console.error('❌ Version validation failed:', error.message)
    process.exit(1)
  }
}

// Run validation if called directly
if (require.main === module) {
  validateVersion()
}

module.exports = { validateVersion } 