// Jest setup file - runs before each test
import 'jest'

// Global test configuration
global.console = {
  ...console,
  // Suppress console.log in tests unless needed
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}

// Set test timeout
jest.setTimeout(10000)

// Add custom matchers if needed
expect.extend({
  toBeValidSchema(received) {
    const pass = received && typeof received === 'object' && received.type
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid schema`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected ${received} to be a valid schema with 'type' property`,
        pass: false,
      }
    }
  },
})

// Declare custom matcher types for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidSchema(): R
    }
  }
} 