// Global teardown for NestJS Jest tests
export default async (): Promise<void> => {
  console.log('🧹 Cleaning up global test environment for Runner service...');

  // Cleanup tasks:
  // await cleanupTestDatabase();
  // await stopTestServices();

  // Give time for cleanup
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log('✅ Global test cleanup complete for Runner service');
};
