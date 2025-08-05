# Testing Guide

This document provides a comprehensive guide for testing the Supertest platform, including unit tests, integration tests, and end-to-end testing strategies.

## Overview

The Supertest platform uses Jest as the primary testing framework for both services:
- **App Service (Next.js)**: Frontend and API route testing
- **Runner Service (NestJS)**: Backend service and test execution testing

## Test Structure

```
├── app/
│   ├── jest.config.js           # Jest configuration for Next.js
│   ├── jest.setup.js            # Global test setup
│   ├── src/
│   │   └── **/__tests__/        # Unit tests alongside source code
│   ├── tests/
│   │   ├── setup/               # Global test setup/teardown
│   │   └── utils/               # Test utilities and helpers
│   └── __mocks__/               # Mock files
└── runner/
    ├── jest.config.js           # Jest configuration for NestJS
    ├── src/
    │   └── **/__tests__/        # Unit tests alongside source code
    └── test/
        ├── setup/               # Global test setup/teardown
        └── utils/               # Test utilities and helpers
```

## Quick Start

### Running Tests

```bash
# App Service Tests
cd app
npm test                    # Run all tests once
npm run test:watch          # Run tests in watch mode
npm run test:coverage       # Run with coverage report
npm run test:ci             # CI-friendly test run

# Runner Service Tests
cd runner
npm test                    # Run all tests once
npm run test:watch          # Run tests in watch mode
npm run test:coverage       # Run with coverage report
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:ci             # CI-friendly test run
```

### Running Specific Tests

```bash
# Run tests for a specific file
npm test -- utils.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="should format duration"

# Run tests in a specific directory
npm test -- src/lib

# Debug tests
npm run test:debug
```

## Test Categories

### 1. Unit Tests

**Location**: `src/**/__tests__/*.test.ts`

Test individual functions, classes, and components in isolation.

**Example Structure**:
```typescript
import { functionToTest } from '../module';
import { createMockDependency } from '../../test/utils/testHelpers';

describe('ModuleName', () => {
  describe('functionToTest', () => {
    it('should return expected result for valid input', () => {
      const result = functionToTest('input');
      expect(result).toBe('expected');
    });

    it('should handle edge cases', () => {
      expect(functionToTest('')).toBe('default');
      expect(functionToTest(null)).toThrow();
    });
  });
});
```

### 2. Integration Tests

**Location**: `test/**/*.test.ts` (Runner), `tests/**/*.test.ts` (App)

Test multiple components working together, including database operations and external service interactions.

### 3. Component Tests (App Service)

Test React components with user interactions:

```typescript
import { render, screen, userEvent } from '../../tests/utils/testHelpers';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('should handle user interactions', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);
    
    const button = screen.getByRole('button', { name: /submit/i });
    await user.click(button);
    
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
```

## Test Utilities

### App Service Utilities

**File**: `app/tests/utils/testHelpers.ts`

Key utilities:
- `customRender()`: Render components with providers
- `createMockUser()`, `createMockOrganization()`: Test data factories
- `waitForAsyncUpdates()`: Async testing helpers
- `fillForm()`, `submitForm()`: Form testing utilities
- `createMockFetch()`: API mocking
- `mockLocalStorage()`: Browser API mocking

**File**: `app/tests/utils/dbMocks.ts`

Database utilities:
- `createMockDb()`: Mock Drizzle database
- `seedTestData`: Test data factories
- `mockTransaction()`: Transaction mocking

### Runner Service Utilities

**File**: `runner/test/utils/testHelpers.ts`

Key utilities:
- `TestModuleBuilder`: NestJS testing module builder
- `createMockRepository()`: TypeORM repository mocking
- `createMockQueue()`: BullMQ queue mocking
- `createMockS3Client()`: AWS S3 client mocking
- `delay()`, `waitForCondition()`: Async testing helpers

**File**: `runner/test/utils/dbMocks.ts`

Database utilities:
- `createMockRepository()`: TypeORM repository mocking
- `createMockEntityManager()`: Entity manager mocking
- `createTestEntityData`: Test data factories

## Mocking Strategies

### 1. External Dependencies

```typescript
// Mock AWS S3
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ ETag: 'mock-etag' }),
  })),
}));

// Mock Redis
jest.mock('ioredis', () => ({
  default: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    publish: jest.fn(),
  })),
}));
```

### 2. Database Operations

```typescript
// App Service (Drizzle)
const mockDb = createMockDb();
mockDb.select().from.mockReturnValue({
  where: jest.fn().mockResolvedValue([mockData]),
});

// Runner Service (TypeORM)
const mockRepository = createMockRepository('Entity');
mockRepository.findOne.mockResolvedValue(mockEntity);
```

### 3. Next.js Components

```typescript
// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));
```

## Coverage Requirements

### Minimum Coverage Thresholds

**App Service**:
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

**Runner Service**:
- Branches: 75%
- Functions: 75%
- Lines: 75%
- Statements: 75%

### Coverage Exclusions

Files excluded from coverage:
- Configuration files
- Database schemas
- Type definitions (`.d.ts`)
- Next.js layout/loading components
- Migration files

## Best Practices

### 1. Test Organization

- **Group related tests**: Use `describe` blocks to group related test cases
- **Clear test names**: Use descriptive test names that explain the expected behavior
- **One assertion per test**: Focus on testing one thing at a time
- **Arrange-Act-Assert**: Structure tests clearly

### 2. Test Data

- **Use factories**: Create reusable test data factories
- **Avoid magic values**: Use constants for test data
- **Clean state**: Ensure each test starts with a clean state

### 3. Async Testing

```typescript
// Use async/await for promises
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected');
});

// Use proper matchers for promises
await expect(promiseFunction()).resolves.toBe('value');
await expect(promiseFunction()).rejects.toThrow('error');
```

### 4. Error Testing

```typescript
it('should handle errors gracefully', () => {
  expect(() => functionThatThrows()).toThrow('Expected error message');
});

it('should handle async errors', async () => {
  await expect(asyncFunctionThatThrows()).rejects.toThrow('Expected error');
});
```

## Debugging Tests

### 1. Debug Mode

```bash
# Debug specific test
npm run test:debug -- --testNamePattern="specific test"
```

### 2. Console Output

```typescript
// Enable verbose output for debugging
console.log('Debug info:', { variable });

// Use debug flag in test environment
if (process.env.DEBUG_TESTS) {
  console.log('Debug output');
}
```

### 3. Test Isolation

```bash
# Run single test file
npm test -- path/to/test.ts

# Run tests in band (no parallel execution)
npm test -- --runInBand
```

## Continuous Integration

### GitHub Actions Configuration

```yaml
- name: Run App Tests
  run: |
    cd app
    npm ci
    npm run test:ci

- name: Run Runner Tests
  run: |
    cd runner
    npm ci
    npm run test:ci
```

### Pre-commit Hooks

Add to `.husky/pre-commit`:
```bash
#!/bin/sh
cd app && npm run test:ci
cd ../runner && npm run test:ci
```

## Performance Testing

### 1. Memory Usage Monitoring

```typescript
import { getMemoryUsage } from '../test/utils/testHelpers';

it('should not leak memory', () => {
  const before = getMemoryUsage();
  
  // Perform memory-intensive operation
  
  const after = getMemoryUsage();
  expect(after.heapUsed - before.heapUsed).toBeLessThan(50); // 50MB threshold
});
```

### 2. Timeout Configuration

```typescript
// Global timeout in jest.config.js
testTimeout: 30000,

// Per-test timeout
it('should complete within time limit', async () => {
  // Test implementation
}, 10000); // 10 second timeout
```

## Troubleshooting

### Common Issues

1. **Tests timing out**:
   - Check for unresolved promises
   - Increase timeout values
   - Use `--runInBand` to avoid parallel execution issues

2. **Mock not working**:
   - Ensure mocks are defined before imports
   - Check mock file locations
   - Verify mock implementation

3. **Database connection errors**:
   - Ensure test database is properly mocked
   - Check environment variable setup
   - Verify test isolation

4. **Memory leaks**:
   - Use `--detectLeaks` flag
   - Check for unclosed connections
   - Verify cleanup in `afterEach`/`afterAll`

### Debug Commands

```bash
# Clear Jest cache
npm run test:clear

# Run with verbose output
npm test -- --verbose

# Run with memory leak detection
npm test -- --detectLeaks

# Run with open handles detection
npm test -- --detectOpenHandles
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library Documentation](https://testing-library.com/)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Next.js Testing](https://nextjs.org/docs/testing)