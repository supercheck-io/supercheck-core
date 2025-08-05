module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directory for tests
  rootDir: '.',
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json', 'ts'],
  
  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,ts}',
    '<rootDir>/src/**/*.(test|spec).{js,ts}',
  ],
  
  // Ignore utility files and setup files from being run as tests
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/test/utils/',
    '<rootDir>/test/setup/',
    '<rootDir>/dist/',
    '<rootDir>/playwright-reports/',
  ],
  
  // Transform configuration
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  
  // Module name mapping for absolute imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/execution/(.*)$': '<rootDir>/src/execution/$1',
    '^@/common/(.*)$': '<rootDir>/src/common/$1',
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest.setup.ts'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.entity.ts',
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
  
  // Test timeout
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Reset modules between tests
  resetModules: true,
  
  // Verbose output
  verbose: true,
  
  // Max workers for parallel execution
  maxWorkers: '50%',
  
  // Global setup and teardown
  globalSetup: '<rootDir>/test/setup/globalSetup.ts',
  globalTeardown: '<rootDir>/test/setup/globalTeardown.ts',
  
  // Preset for NestJS testing
  preset: 'ts-jest',
  
  // Module path ignore patterns
  modulePathIgnorePatterns: ['<rootDir>/dist/', '<rootDir>/playwright-reports/'],
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))',
  ],
  
  // Error on deprecated features
  errorOnDeprecated: true,
  
  // Detect leaks
  detectOpenHandles: true,
  detectLeaks: true,
  
  // Force exit after tests complete
  forceExit: true,
};