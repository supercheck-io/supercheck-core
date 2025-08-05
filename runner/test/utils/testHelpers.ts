import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// NestJS testing utilities
export class TestModuleBuilder {
  static async createTestingModule(metadata: any): Promise<TestingModule> {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        ...metadata.imports || [],
      ],
      providers: metadata.providers || [],
      controllers: metadata.controllers || [],
    }).compile();
  }

  static async createTestApp(module: TestingModule): Promise<INestApplication> {
    const app = module.createNestApplication();
    await app.init();
    return app;
  }
}

// Mock data factories for runner service
export const createMockJobData = (overrides = {}) => ({
  id: 'job-id',
  testId: 'test-id',
  organizationId: 'org-id',
  projectId: 'project-id',
  playwrightCode: 'test("example", async ({ page }) => { /* test code */ });',
  timeout: 30000,
  retries: 2,
  browser: 'chromium',
  viewport: { width: 1920, height: 1080 },
  ...overrides,
});

export const createMockRunData = (overrides = {}) => ({
  id: 'run-id',
  jobId: 'job-id',
  testId: 'test-id',
  organizationId: 'org-id',
  projectId: 'project-id',
  status: 'pending',
  result: null,
  duration: null,
  startedAt: null,
  completedAt: null,
  errorMessage: null,
  playwrightReport: null,
  ...overrides,
});

export const createMockTestData = (overrides = {}) => ({
  id: 'test-id',
  name: 'Test E2E Flow',
  description: 'Test description',
  playwrightCode: 'test("example", async ({ page }) => { /* test code */ });',
  organizationId: 'org-id',
  projectId: 'project-id',
  ...overrides,
});

// Database mocking utilities
export const createMockRepository = <T>(entityName: string) => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(),
  count: jest.fn(),
  query: jest.fn(),
  findAndCount: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    getCount: jest.fn(),
  })),
});

// Queue mocking utilities
export const createMockQueue = (name: string) => ({
  name,
  add: jest.fn().mockResolvedValue({ id: 'job-id' }),
  process: jest.fn(),
  getActive: jest.fn().mockResolvedValue([]),
  getWaiting: jest.fn().mockResolvedValue([]),
  getCompleted: jest.fn().mockResolvedValue([]),
  getFailed: jest.fn().mockResolvedValue([]),
  getDelayed: jest.fn().mockResolvedValue([]),
  clean: jest.fn().mockResolvedValue(0),
  close: jest.fn().mockResolvedValue(void 0),
  pause: jest.fn().mockResolvedValue(void 0),
  resume: jest.fn().mockResolvedValue(void 0),
  on: jest.fn(),
  off: jest.fn(),
  removeAllListeners: jest.fn(),
});

// S3 mocking utilities
export const createMockS3Client = () => ({
  send: jest.fn().mockImplementation((command) => {
    if (command.constructor.name === 'PutObjectCommand') {
      return Promise.resolve({ ETag: '"mock-etag"' });
    }
    if (command.constructor.name === 'GetObjectCommand') {
      return Promise.resolve({
        Body: {
          transformToString: jest.fn().mockResolvedValue('mock file content'),
        },
      });
    }
    if (command.constructor.name === 'DeleteObjectCommand') {
      return Promise.resolve({});
    }
    return Promise.resolve({});
  }),
});

// Redis mocking utilities
export const createMockRedisClient = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  keys: jest.fn(),
  flushdb: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  status: 'ready',
});

// Logger mocking utilities
export const createMockLogger = () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  setContext: jest.fn(),
});

// File system mocking utilities
export const createMockFileSystem = () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  rmdir: jest.fn(),
  unlink: jest.fn(),
  access: jest.fn(),
  stat: jest.fn(),
  exists: jest.fn(),
});

// Child process mocking utilities
export const createMockChildProcess = () => ({
  spawn: jest.fn().mockReturnValue({
    stdout: {
      on: jest.fn(),
      pipe: jest.fn(),
    },
    stderr: {
      on: jest.fn(),
      pipe: jest.fn(),
    },
    on: jest.fn(),
    kill: jest.fn(),
    pid: 12345,
  }),
  exec: jest.fn(),
  execSync: jest.fn(),
});

// Playwright execution mocking utilities
export const createMockPlaywrightResult = (overrides = {}) => ({
  passed: true,
  duration: 5000,
  output: 'Test completed successfully',
  reportPath: '/path/to/report.html',
  artifactsPath: '/path/to/artifacts',
  screenshots: ['/path/to/screenshot.png'],
  videos: ['/path/to/video.webm'],
  ...overrides,
});

// Async testing utilities
export const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

export const waitForCondition = async (
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> => {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await delay(interval);
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
};

// Environment utilities
export const withTestEnv = (envVars: Record<string, string>, fn: () => void | Promise<void>) => {
  const originalEnv = { ...process.env };
  
  // Set test environment variables
  Object.assign(process.env, envVars);
  
  return async () => {
    try {
      await fn();
    } finally {
      // Restore original environment
      process.env = originalEnv;
    }
  };
};

// Memory usage monitoring for tests
export const getMemoryUsage = () => {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
  };
};

// Test timeout utilities
export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};

// Database connection utilities for integration tests
export const createTestDatabaseConnection = async () => {
  // This would typically create a real database connection for integration tests
  // For now, we'll return a mock
  return {
    query: jest.fn(),
    close: jest.fn(),
    isConnected: true,
  };
};

// Cleanup utilities
export const cleanupTestArtifacts = async (testId: string) => {
  // Clean up any test artifacts, temporary files, etc.
  // This is a placeholder - implement based on your needs
  console.log(`Cleaning up artifacts for test ${testId}`);
};