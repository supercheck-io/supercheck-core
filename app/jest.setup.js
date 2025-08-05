import '@testing-library/jest-dom';
import 'whatwg-fetch';

// Global test configuration and setup

// Setup fetch polyfills for Next.js API routes
const { Request, Response } = require('node-fetch');
if (!global.Request) global.Request = Request;
if (!global.Response) global.Response = Response;
if (!global.fetch) global.fetch = require('node-fetch');

// Mock Next.js server components
if (!global.Headers) {
  global.Headers = class Headers extends Map {
    constructor(init) {
      super();
      if (init) {
        if (typeof init === 'object') {
          for (const [key, value] of Object.entries(init)) {
            this.set(key, value);
          }
        }
      }
    }
    
    append(name, value) {
      const existing = this.get(name);
      this.set(name, existing ? `${existing}, ${value}` : value);
    }
    
    delete(name) {
      super.delete(name.toLowerCase());
    }
    
    get(name) {
      return super.get(name.toLowerCase());
    }
    
    has(name) {
      return super.has(name.toLowerCase());
    }
    
    set(name, value) {
      super.set(name.toLowerCase(), String(value));
    }
  };
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '';
  },
}));

// Mock Next.js image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt} />;
  },
}));

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.NEXTAUTH_URL = 'http://localhost:3000';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to ignore specific console methods
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
global.testUtils = {
  // Helper to create mock server actions
  createMockServerAction: (returnValue) => jest.fn().mockResolvedValue(returnValue),
  
  // Helper to create mock API responses
  createMockApiResponse: (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(JSON.stringify(data)),
  }),
};

// Setup custom matchers
expect.extend({
  toHaveBeenCalledWithMatchingObject(received, expected) {
    const pass = received.mock.calls.some(callArgs =>
      callArgs.some(arg => 
        typeof arg === 'object' && 
        Object.keys(expected).every(key => arg[key] === expected[key])
      )
    );
    
    if (pass) {
      return {
        message: () => `Expected function not to have been called with object matching ${JSON.stringify(expected)}`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected function to have been called with object matching ${JSON.stringify(expected)}`,
        pass: false,
      };
    }
  },
});

// Increase timeout for integration tests
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  // Clear all timers
  jest.clearAllTimers();
  
  // Reset all mocks
  jest.clearAllMocks();
});