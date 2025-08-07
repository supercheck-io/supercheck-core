// Database mocking utilities for app service
import { drizzle } from 'drizzle-orm/postgres-js';

// Mock Drizzle database instance
export const createMockDb = () => {
  const mockDb: any = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    all: jest.fn(),
    get: jest.fn(),
    run: jest.fn(),
    transaction: jest.fn((callback) => callback(mockDb)),
    $with: jest.fn().mockReturnThis(),
    with: jest.fn().mockReturnThis(),
  };

  // Add table-specific methods
  mockDb.query = {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    organization: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    test: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    job: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    run: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    monitor: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  return mockDb;
};

// Mock database responses
export const createMockDbResponse = <T>(data: T | T[], isArray = false) => {
  if (isArray) {
    return Promise.resolve(Array.isArray(data) ? data : [data]);
  }
  return Promise.resolve(data);
};

// Database seeding utilities for tests
export const seedTestData = {
  user: (overrides = {}) => ({
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    emailVerified: null,
    organizationId: 'org-1',
    role: 'project_viewer',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),

  organization: (overrides = {}) => ({
    id: 'org-1',
    name: 'Test Organization',
    slug: 'test-org',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),

  test: (overrides = {}) => ({
    id: 'test-1',
    name: 'Test E2E Flow',
    description: 'Integration test for user login flow',
    playwrightCode: 'test("login flow", async ({ page }) => { /* test code */ });',
    organizationId: 'org-1',
    projectId: 'project-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),

  job: (overrides = {}) => ({
    id: 'job-1',
    name: 'Daily Login Test',
    cron: '0 9 * * *',
    testId: 'test-1',
    enabled: true,
    organizationId: 'org-1',
    projectId: 'project-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),

  run: (overrides = {}) => ({
    id: 'run-1',
    testId: 'test-1',
    jobId: 'job-1',
    status: 'completed',
    result: 'passed',
    duration: 5000,
    organizationId: 'org-1',
    projectId: 'project-1',
    startedAt: new Date('2024-01-01T09:00:00Z'),
    completedAt: new Date('2024-01-01T09:00:05Z'),
    errorMessage: null,
    playwrightReport: 'https://example.com/report.html',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),

  monitor: (overrides = {}) => ({
    id: 'monitor-1',
    name: 'API Health Check',
    url: 'https://api.example.com/health',
    method: 'GET',
    interval: 300,
    timeout: 30000,
    enabled: true,
    organizationId: 'org-1',
    projectId: 'project-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),

  project: (overrides = {}) => ({
    id: 'project-1',
    name: 'Test Project',
    organizationId: 'org-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),
};

// Transaction mocking
export const mockTransaction = <T>(callback: (tx: any) => Promise<T>) => {
  const mockTx = createMockDb();
  return callback(mockTx);
};

// Connection pool mocking
export const createMockConnectionPool = () => ({
  connect: jest.fn().mockResolvedValue({
    query: jest.fn(),
    release: jest.fn(),
  }),
  end: jest.fn(),
  query: jest.fn(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
});

// Migration mocking
export const mockMigrations = {
  up: jest.fn().mockResolvedValue(void 0),
  down: jest.fn().mockResolvedValue(void 0),
  getAppliedMigrations: jest.fn().mockResolvedValue([]),
  getPendingMigrations: jest.fn().mockResolvedValue([]),
};

// Query builder helpers
export const expectQueryToContain = (mockFn: jest.Mock, expectedText: string) => {
  const calls = mockFn.mock.calls;
  const hasExpectedText = calls.some(call => 
    call.some((arg: any) => 
      typeof arg === 'string' && arg.includes(expectedText)
    )
  );
  
  if (!hasExpectedText) {
    throw new Error(`Expected query to contain "${expectedText}" but it was not found in: ${JSON.stringify(calls)}`);
  }
};

export const expectQueryParams = (mockFn: jest.Mock, expectedParams: any[]) => {
  const lastCall = mockFn.mock.calls[mockFn.mock.calls.length - 1];
  if (!lastCall) {
    throw new Error('Expected query to have been called but it was not');
  }
  
  const actualParams = lastCall[1] || [];
  expect(actualParams).toEqual(expectedParams);
};