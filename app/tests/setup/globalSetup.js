// Global setup for Jest tests
module.exports = async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.TZ = 'UTC';
  
  // Setup test database if needed
  console.log('🧪 Setting up global test environment...');
  
  // You can add database seeding, external service mocking, etc. here
  // Example:
  // await setupTestDatabase();
  // await startMockServices();
  
  console.log('✅ Global test setup complete');
};