// test-redis.js
const Redis = require('ioredis');

async function testRedisConnection() {
  try {
    console.log('Testing Redis connection...');
    const redis = new Redis('redis://localhost:6379');
    
    // Set a test value
    await redis.set('test-key', 'Hello from BullMQ migration!');
    console.log('Successfully set test value');
    
    // Get the test value
    const value = await redis.get('test-key');
    console.log('Retrieved value:', value);
    
    // Clean up
    await redis.del('test-key');
    console.log('Cleaned up test value');
    
    // Close connection
    await redis.quit();
    console.log('Redis connection test passed!');
    return true;
  } catch (error) {
    console.error('Redis connection test failed:', error);
    return false;
  }
}

// Run the test
testRedisConnection()
  .then(result => {
    console.log('Test result:', result);
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  }); 