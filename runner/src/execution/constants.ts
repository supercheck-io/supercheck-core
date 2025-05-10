export const JOB_EXECUTION_QUEUE = 'job-execution';
export const TEST_EXECUTION_QUEUE = 'test-execution';

// Default capacity limits that should match the frontend settings
export const RUNNING_CAPACITY = parseInt(process.env.RUNNING_CAPACITY || '5', 10);

/**
 * QUEUED_CAPACITY defines the maximum number of jobs that can be in the queue.
 * This is a hard limit enforced at the API layer - new submissions will be rejected
 * with a 429 (Too Many Requests) status code once this limit is reached.
 */
export const QUEUED_CAPACITY = parseInt(process.env.QUEUED_CAPACITY || '10', 10);

/**
 * MAX_CONCURRENT_TESTS is different from Playwright's own parallelism setting:
 * 
 * - Playwright parallelism (in playwright.config.js): Controls how many browser 
 *   instances run WITHIN a single test job
 * 
 * - MAX_CONCURRENT_TESTS: Controls how many separate test JOBS can run in parallel
 *   on the worker service
 * 
 * If you're using Playwright's parallelism, you may want to set this to 1 to avoid
 * overloading the system, as each job will already spawn multiple browser instances.
 */
export const MAX_CONCURRENT_TESTS = parseInt(
  process.env.MAX_CONCURRENT_TESTS || 
  // Default to 1 for optimal use with Playwright's internal parallelism
  '1', 
  10
); 