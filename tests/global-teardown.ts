// Global teardown for Jest - runs once after all tests
export default async function globalTeardown() {
  console.log('🧹 Cleaning up test environment...')
  
  // Clean up any global test resources
  // e.g., stop test database, clean temp directories, etc.
  
  console.log('✅ Test environment cleaned up!')
} 