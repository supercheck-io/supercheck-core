// Global setup for NestJS Jest tests
export default async (): Promise<void> => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.TZ = 'UTC';
  
  console.log('🧪 Setting up global test environment for Runner service...');
  
  // Setup test database connection
  // Note: In a real scenario, you might want to:
  // 1. Start a test database container
  // 2. Run migrations
  // 3. Seed test data
  
  // Example setup tasks:
  // await setupTestDatabase();
  // await runTestMigrations();
  // await seedTestData();
  
  console.log('✅ Global test setup complete for Runner service');
};