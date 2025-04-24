// test-bullmq.js
const { Queue, Worker, QueueEvents } = require('bullmq');
const Redis = require('ioredis');

async function testBullMQ() {
  try {
    console.log('Testing BullMQ with Redis...');
    
    // Configure Redis connection with correct options for BullMQ
    const connection = new Redis('redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false
    });
    
    // Create a test queue
    const queue = new Queue('test-queue', { connection });
    
    // Create queue events listener
    const queueEvents = new QueueEvents('test-queue', { connection });
    
    // Wait for events to be ready
    await new Promise((resolve) => {
      queueEvents.once('waiting', () => resolve());
      // Fallback if waiting event isn't triggered
      setTimeout(resolve, 1000);
    });
    
    // Create a worker
    const worker = new Worker('test-queue', async (job) => {
      console.log(`Processing job ${job.id}`);
      return { processed: true, data: job.data };
    }, { connection });
    
    // Listen for completion events
    const completionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Job completion timeout'));
      }, 5000);
      
      queueEvents.on('completed', ({ jobId }) => {
        console.log(`Job ${jobId} completed`);
        clearTimeout(timeout);
        resolve();
      });
      
      queueEvents.on('failed', ({ jobId, failedReason }) => {
        console.error(`Job ${jobId} failed: ${failedReason}`);
        clearTimeout(timeout);
        reject(new Error(failedReason));
      });
    });
    
    // Add a job to the queue
    const testData = { message: "Hello BullMQ", timestamp: Date.now() };
    console.log('Adding job to queue...');
    const job = await queue.add('test-job', testData);
    console.log(`Job added with ID: ${job.id}`);
    
    // Wait for job completion
    await completionPromise;
    console.log('Job was processed successfully');
    
    // Clean up
    await worker.close();
    await queue.close();
    await queueEvents.close();
    await connection.quit();
    
    console.log('BullMQ test passed!');
    return true;
  } catch (error) {
    console.error('BullMQ test failed:', error);
    return false;
  }
}

// Run the test
testBullMQ()
  .then(result => {
    console.log('Test result:', result);
    process.exit(result ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  }); 