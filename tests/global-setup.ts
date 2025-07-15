// Global setup for Jest - runs once before all tests
export default async function globalSetup() {
  console.log('🧪 Setting up test environment...')
  
  // Set test environment variables
  process.env.NODE_ENV = 'test'
  process.env.CI = 'true'
  
  // Any global test setup here
  // e.g., start test database, create temp directories, etc.
  
  console.log('✅ Test environment ready!')
} 