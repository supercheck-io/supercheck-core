export const JOB_EXECUTION_QUEUE = 'job-execution';
export const TEST_EXECUTION_QUEUE = 'test-execution';

// Default capacity limits that should match the frontend settings
export const RUNNING_CAPACITY = parseInt(process.env.RUNNING_CAPACITY || '5', 10);

/**
 * QUEUED_CAPACITY defines the maximum number of jobs that can be in the queue.
 * The API layer will reject new job submissions once this limit is reached.
 * This is a safety measure to prevent overwhelming the queue with too many jobs.
 */
export const QUEUED_CAPACITY = parseInt(process.env.QUEUED_CAPACITY || '50', 10);

/**
 * MAX_CONCURRENT_TESTS is different from Playwright's own parallelism setting:
 * 
 * In the context of our system:
 * - Playwright's workers: Controls browser instance parallelism WITHIN a single test
 * - MAX_CONCURRENT_TESTS: Controls how many separate test JOBS can run in parallel
 * 
 * This is a critical setting that determines worker concurrency and resource usage.
 */
export const MAX_CONCURRENT_TESTS = parseInt(
  process.env.MAX_CONCURRENT_TESTS || 
  '2', // Default to 2 concurrent test jobs
  10
); 