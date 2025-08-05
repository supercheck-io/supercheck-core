import { TestingModule } from '@nestjs/testing';

// Global test configuration
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.TZ = 'UTC';
  
  // Mock environment variables
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.REDIS_URL = 'redis://localhost:6379/1'; // Use different Redis DB for tests
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.REDIS_DB = '1';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  process.env.S3_BUCKET_NAME = 'test-bucket';
  process.env.S3_ENDPOINT = 'http://localhost:9000';
  process.env.RUNNING_CAPACITY = '5';
  process.env.QUEUED_CAPACITY = '20';
  process.env.TEST_EXECUTION_TIMEOUT_MS = '30000';
});

// Global test utilities
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createMockRepository: <T>(entityName: string) => MockRepository<T>;
        createMockQueue: () => MockQueue;
        createMockLogger: () => MockLogger;
        createTestingModule: (metadata: any) => Promise<TestingModule>;
        delay: (ms: number) => Promise<void>;
      };
    }
  }
}

// Mock repository interface
interface MockRepository<T> {
  find: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  create: jest.Mock;
  count: jest.Mock;
  query: jest.Mock;
}

// Mock queue interface
interface MockQueue {
  add: jest.Mock;
  process: jest.Mock;
  getActive: jest.Mock;
  getWaiting: jest.Mock;
  getCompleted: jest.Mock;
  getFailed: jest.Mock;
  clean: jest.Mock;
  close: jest.Mock;
}

// Mock logger interface
interface MockLogger {
  log: jest.Mock;
  error: jest.Mock;
  warn: jest.Mock;
  debug: jest.Mock;
  verbose: jest.Mock;
}

// Global test utilities
global.testUtils = {
  // Create mock repository
  createMockRepository: <T>(entityName: string): MockRepository<T> => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    query: jest.fn(),
  }),

  // Create mock queue
  createMockQueue: (): MockQueue => ({
    add: jest.fn(),
    process: jest.fn(),
    getActive: jest.fn().mockResolvedValue([]),
    getWaiting: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    clean: jest.fn(),
    close: jest.fn(),
  }),

  // Create mock logger
  createMockLogger: (): MockLogger => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  }),

  // Create testing module helper
  createTestingModule: async (metadata: any): Promise<TestingModule> => {
    const { Test } = await import('@nestjs/testing');
    return Test.createTestingModule(metadata).compile();
  },

  // Delay helper for async tests
  delay: (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms)),
};

// Mock external dependencies
jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      expire: jest.fn(),
      disconnect: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    })),
  };
});

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => global.testUtils.createMockQueue()),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn(),
  })),
  QueueEvents: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    off: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url.com'),
}));

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  exec: jest.fn(),
  execSync: jest.fn(),
  fork: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    rmdir: jest.fn(),
    unlink: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
  },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

// Console output management
const originalConsole = { ...console };
global.console = {
  ...console,
  // Suppress logs in tests unless explicitly needed
  log: process.env.VERBOSE_TESTS ? originalConsole.log : jest.fn(),
  debug: process.env.VERBOSE_TESTS ? originalConsole.debug : jest.fn(),
  info: process.env.VERBOSE_TESTS ? originalConsole.info : jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
});

// Cleanup after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 100));
});