// Database mocking utilities for runner service
import {
  Repository,
  EntityManager,
  QueryRunner,
  SelectQueryBuilder,
} from 'typeorm';

// Mock TypeORM repository
export const createMockRepository = <T>(
  entityName: string,
): jest.Mocked<Repository<T>> => {
  const mockQueryBuilder = createMockQueryBuilder<T>();

  return {
    // Basic CRUD operations
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findOneOrFail: jest.fn(),
    findBy: jest.fn(),
    findAndCount: jest.fn(),
    findAndCountBy: jest.fn(),
    save: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
    recover: jest.fn(),
    create: jest.fn(),
    merge: jest.fn(),
    preload: jest.fn(),

    // Query builder
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),

    // Counting
    count: jest.fn(),
    countBy: jest.fn(),
    sum: jest.fn(),
    average: jest.fn(),
    minimum: jest.fn(),
    maximum: jest.fn(),

    // Metadata and manager
    target: {} as any,
    manager: createMockEntityManager(),
    metadata: {} as any,
    queryRunner: undefined,

    // Relations
    increment: jest.fn(),
    decrement: jest.fn(),

    // Existence
    exist: jest.fn(),
    existsBy: jest.fn(),

    // Raw queries
    query: jest.fn(),

    // Others
    clear: jest.fn(),
    getId: jest.fn(),
    hasId: jest.fn(),
    reload: jest.fn(),
    extend: jest.fn(),
  } as jest.Mocked<Repository<T>>;
};

// Mock QueryBuilder
export const createMockQueryBuilder = <T>(): jest.Mocked<
  SelectQueryBuilder<T>
> => {
  const mockQueryBuilder = {
    // Selection
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),

    // FROM clause
    from: jest.fn().mockReturnThis(),

    // WHERE clause
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    andWhereInIds: jest.fn().mockReturnThis(),
    orWhereInIds: jest.fn().mockReturnThis(),

    // HAVING clause
    having: jest.fn().mockReturnThis(),
    andHaving: jest.fn().mockReturnThis(),
    orHaving: jest.fn().mockReturnThis(),

    // ORDER BY clause
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),

    // GROUP BY clause
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),

    // LIMIT and OFFSET
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),

    // JOIN
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),

    // Parameters
    setParameter: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),

    // Execution
    getOne: jest.fn(),
    getOneOrFail: jest.fn(),
    getMany: jest.fn(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    getCount: jest.fn(),
    getExists: jest.fn(),
    stream: jest.fn(),

    // Raw SQL
    getSql: jest.fn(),
    printSql: jest.fn(),

    // Cloning
    clone: jest.fn().mockReturnThis(),

    // Others
    cache: jest.fn().mockReturnThis(),
    useTransaction: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),

    // Internal properties
    connection: {} as any,
    queryRunner: undefined,
    expressionMap: {} as any,
  } as jest.Mocked<SelectQueryBuilder<T>>;

  return mockQueryBuilder;
};

// Mock EntityManager
export const createMockEntityManager = (): jest.Mocked<EntityManager> =>
  ({
    connection: {} as any,
    queryRunner: {} as any,
    transaction: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
    getRepository: jest
      .fn()
      .mockImplementation((entity) =>
        createMockRepository(entity.name || 'unknown'),
      ),
    getTreeRepository: jest.fn(),
    getMongoRepository: jest.fn(),
    getCustomRepository: jest.fn(),
    release: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findOneOrFail: jest.fn(),
    findBy: jest.fn(),
    findAndCount: jest.fn(),
    findAndCountBy: jest.fn(),
    save: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
    recover: jest.fn(),
    create: jest.fn(),
    merge: jest.fn(),
    preload: jest.fn(),
    count: jest.fn(),
    countBy: jest.fn(),
    sum: jest.fn(),
    average: jest.fn(),
    minimum: jest.fn(),
    maximum: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    exist: jest.fn(),
    existsBy: jest.fn(),
    clear: jest.fn(),
    getId: jest.fn(),
    hasId: jest.fn(),
    reload: jest.fn(),
    extend: jest.fn(),
  }) as jest.Mocked<EntityManager>;

// Test data factories
export const createTestEntityData = {
  run: (overrides = {}) => ({
    id: 'run-1',
    testId: 'test-1',
    jobId: 'job-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    status: 'pending',
    result: null,
    duration: null,
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    playwrightReport: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),

  test: (overrides = {}) => ({
    id: 'test-1',
    name: 'Test E2E Flow',
    description: 'Integration test',
    playwrightCode: 'test("example", async ({ page }) => {});',
    organizationId: 'org-1',
    projectId: 'project-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),

  job: (overrides = {}) => ({
    id: 'job-1',
    name: 'Daily Test',
    cron: '0 9 * * *',
    testId: 'test-1',
    enabled: true,
    organizationId: 'org-1',
    projectId: 'project-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),

  user: (overrides = {}) => ({
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    organizationId: 'org-1',
    role: 'member',
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

  project: (overrides = {}) => ({
    id: 'project-1',
    name: 'Test Project',
    organizationId: 'org-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  }),
};

// Database transaction mocking
export const mockTransaction = async <T>(
  callback: (entityManager: EntityManager) => Promise<T>,
): Promise<T> => {
  const mockEntityManager = createMockEntityManager();
  return callback(mockEntityManager);
};

// Query expectations
export const expectRepositoryCall = (
  mockRepository: jest.Mocked<Repository<any>>,
  method: string,
  expectedArgs?: any[],
) => {
  const calls = (mockRepository as any)[method].mock.calls;

  if (calls.length === 0) {
    throw new Error(`Expected ${method} to have been called but it was not`);
  }

  if (expectedArgs) {
    const lastCall = calls[calls.length - 1];
    expect(lastCall).toEqual(expectedArgs);
  }
};

// Database connection mocking
export const createMockDataSource = () => ({
  isInitialized: true,
  getRepository: jest
    .fn()
    .mockImplementation((entity) =>
      createMockRepository(entity.name || 'unknown'),
    ),
  getTreeRepository: jest.fn(),
  getMongoRepository: jest.fn(),
  manager: createMockEntityManager(),
  createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
  createQueryRunner: jest.fn(),
  transaction: jest
    .fn()
    .mockImplementation((callback) => callback(createMockEntityManager())),
  query: jest.fn(),
  initialize: jest.fn(),
  destroy: jest.fn(),
  synchronize: jest.fn(),
  dropDatabase: jest.fn(),
  runMigrations: jest.fn(),
  undoLastMigration: jest.fn(),
  showMigrations: jest.fn(),
});

// Integration test database setup
export const setupTestDatabase = async () => {
  // In a real scenario, this would:
  // 1. Create a test database
  // 2. Run migrations
  // 3. Seed initial data
  // For now, we'll just return a mock
  return createMockDataSource();
};

export const cleanupTestDatabase = async () => {
  // Clean up test database
  // Drop all tables, reset sequences, etc.
  console.log('Cleaning up test database...');
};
