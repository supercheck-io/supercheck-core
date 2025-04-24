// test-queue.js
// This script tests our queue implementation directly

// First we need to compile TypeScript to JavaScript
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    esModuleInterop: true,
  }
});

async function testQueueModule() {
  try {
    // Set the REDIS_URL environment variable if not already set
    if (!process.env.REDIS_URL) {
      process.env.REDIS_URL = 'redis://localhost:6379';
    }
    
    console.log('Testing queue module with Redis...');
    
    // Import our queue module
    const queueModule = require('./src/lib/queue');
    
    // Run the built-in connectivity test
    console.log('Running queue connectivity test...');
    const connectionTestResult = await queueModule.testQueueConnectivity();
    console.log(`Connection test result: ${connectionTestResult}`);
    
    if (!connectionTestResult) {
      throw new Error('Queue connectivity test failed');
    }
    
    // Test adding an actual test job
    console.log('Testing add test to queue...');
    const testTask = {
      testId: 'test-' + Date.now(),
      testPath: '/tmp/test-path.js'
    };
    
    // Add test to queue
    const testJobId = await queueModule.addTestToQueue(testTask);
    console.log(`Test job added with ID: ${testJobId}`);
    
    // Clean up
    await queueModule.closeQueue();
    
    console.log('Queue module test completed successfully');
    return true;
  } catch (error) {
    console.error('Queue module test failed:', error);
    // Try to close the queue in case of error
    try {
      const queueModule = require('./src/lib/queue');
      await queueModule.closeQueue();
    } catch (closeError) {
      console.error('Error closing queue:', closeError);
    }
    return false;
  }
}

// Run the test
testQueueModule()
  .then(result => {
    console.log('Test result:', result);
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  }); 