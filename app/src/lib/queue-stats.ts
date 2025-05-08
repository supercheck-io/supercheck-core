import { Redis } from 'ioredis';
import { TEST_EXECUTION_QUEUE, JOB_EXECUTION_QUEUE } from '@/lib/queue';

// Default capacity limits - should match runner worker threads configuration
export const RUNNING_CAPACITY = 50; 
export const QUEUED_CAPACITY = 100;

export interface QueueStats {
  running: number;
  runningCapacity: number;
  queued: number;
  queuedCapacity: number;
}

/**
 * Fetch real queue statistics from Redis using BullMQ key patterns
 */
export async function fetchQueueStats(): Promise<QueueStats> {
  // Set up Redis connection
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379');
  const password = process.env.REDIS_PASSWORD;
  
  const redisClient = new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 3000,
  });

  try {
    // Initialize counters
    let runningCount = 0;
    let queuedCount = 0;
    
    // Track all jobs and tests to prevent double-counting
    const processedRunningJobs = new Set<string>();
    const processedRunningTests = new Set<string>();
    const processedQueuedJobs = new Set<string>();
    const processedQueuedTests = new Set<string>();
    
    // Step 1: First try to get running jobs and tests directly from the "active" sets
    try {
      const activeJobs = await redisClient.smembers(`bull:${JOB_EXECUTION_QUEUE}:active`);
      console.log(`Found ${activeJobs.length} active jobs in active set`);
      
      for (const jobId of activeJobs) {
        if (processedRunningJobs.has(jobId)) continue;
        processedRunningJobs.add(jobId);
        
        try {
          const jobData = await redisClient.hget(`bull:${JOB_EXECUTION_QUEUE}:${jobId}`, 'data');
          if (jobData) {
            try {
              const data = JSON.parse(jobData);
              
              // First check for individual test count from status messages
              const statusMessages = await redisClient.lrange(`job-status:${jobId}`, -5, -1);
              let testCountFromStatus = 0;
              
              for (const msg of statusMessages) {
                try {
                  const statusData = JSON.parse(msg);
                  if (statusData.message && typeof statusData.message === 'string') {
                    // Look for messages like "Starting execution of X tests"
                    const match = statusData.message.match(/execution of (\d+) tests/i);
                    if (match && match[1]) {
                      testCountFromStatus = parseInt(match[1], 10);
                      console.log(`Active job ${jobId} has ${testCountFromStatus} individual tests (from status message)`);
                      break;
                    }
                  }
                } catch (e: unknown) {
                  // Ignore parsing errors for individual messages
                }
              }
              
              if (testCountFromStatus > 0) {
                runningCount += testCountFromStatus;
              } else if (data.testScripts && Array.isArray(data.testScripts)) {
                let estimatedTests = 0;
                for (const script of data.testScripts) {
                  if (script.script && typeof script.script === 'string') {
                    // Count occurrences of test(...) or it(...) patterns in the script
                    const testMatches = (script.script.match(/\btest\s*\(/g) || []).length;
                    const itMatches = (script.script.match(/\bit\s*\(/g) || []).length;
                    const totalMatches = testMatches + itMatches;
                    
                    estimatedTests += totalMatches > 0 ? totalMatches : 1;
                  } else {
                    estimatedTests += 1;
                  }
                }
                runningCount += estimatedTests;
                console.log(`Active job ${jobId} has approximately ${estimatedTests} individual tests (from script analysis)`);
              } else if (data.testCount && typeof data.testCount === 'number') {
                runningCount += data.testCount;
                console.log(`Active job ${jobId} has ${data.testCount} tests (from testCount)`);
              } else {
                runningCount += 1;
                console.log(`Active job ${jobId} has at least 1 test (default)`);
              }
            } catch (e: unknown) {
              console.log(`Error parsing job data for ${jobId}, counting as 1 test`);
              runningCount += 1;
            }
          } else {
            runningCount += 1;
            console.log(`No data for active job ${jobId}, counting as 1 test`);
          }
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.log(`Error getting data for active job ${jobId}, counting as 1 test: ${errorMessage}`);
          runningCount += 1;
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.log(`Error getting active jobs from active set: ${errorMessage}`);
    }
    
    // Individual active tests
    try {
      const activeTests = await redisClient.smembers(`bull:${TEST_EXECUTION_QUEUE}:active`);
      console.log(`Found ${activeTests.length} active individual tests in active set`);
      
      for (const testId of activeTests) {
        if (processedRunningTests.has(testId)) continue;
        processedRunningTests.add(testId);
        
        try {
          const testData = await redisClient.hget(`bull:${TEST_EXECUTION_QUEUE}:${testId}`, 'data');
          if (testData) {
            try {
              const data = JSON.parse(testData);
              
              if (data.code && typeof data.code === 'string') {
                const testMatches = (data.code.match(/\btest\s*\(/g) || []).length;
                const itMatches = (data.code.match(/\bit\s*\(/g) || []).length;
                const totalMatches = testMatches + itMatches;
                
                if (totalMatches > 0) {
                  runningCount += totalMatches;
                  console.log(`Active test ${testId} has ${totalMatches} individual tests`);
                } else {
                  runningCount += 1;
                  console.log(`Active test ${testId} has at least 1 test (no patterns found)`);
                }
              } else {
                runningCount += 1;
                console.log(`Active test ${testId} has at least 1 test (no code available)`);
              }
            } catch (e: unknown) {
              runningCount += 1;
            }
          } else {
            runningCount += 1;
          }
        } catch (e: unknown) {
          runningCount += 1;
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.log(`Error getting active tests from active set: ${errorMessage}`);
    }
    
    // Step 2: Check for jobs in progress through timestamp analysis (processedOn but not finishedOn)
    try {
      const jobKeys = await redisClient.keys(`bull:${JOB_EXECUTION_QUEUE}:*`);
      const jobIds = new Set<string>();
      
      // Extract actual job IDs (not bull:queue:wait, etc.)
      for (const key of jobKeys) {
        const parts = key.split(':');
        if (parts.length >= 3) {
          const id = parts[2];
          if (id && !['wait', 'active', 'completed', 'failed', 'delayed', 'paused', 'meta', 'events', 'stalled-check'].includes(id)) {
            jobIds.add(id);
          }
        }
      }
      
      console.log(`Found ${jobIds.size} total job IDs to check for processing status`);
      
      // Check each job's state to see if it's running
      for (const jobId of jobIds) {
        // Skip if already processed
        if (processedRunningJobs.has(jobId)) continue;
        
        try {
          const processedOn = await redisClient.hget(`bull:${JOB_EXECUTION_QUEUE}:${jobId}`, 'processedOn');
          const finishedOn = await redisClient.hget(`bull:${JOB_EXECUTION_QUEUE}:${jobId}`, 'finishedOn');
          
          if (processedOn && !finishedOn) {
            processedRunningJobs.add(jobId);
            console.log(`Job ${jobId} is being processed (detected via timestamps)`);
            
            // Try to get individual test count
            let individualTestCount = 0;
            
            // First check status messages
            try {
              const statusMessages = await redisClient.lrange(`job-status:${jobId}`, -5, -1);
              for (const msg of statusMessages) {
                try {
                  const statusData = JSON.parse(msg);
                  if (statusData.message && typeof statusData.message === 'string') {
                    const match = statusData.message.match(/execution of (\d+) tests/i);
                    if (match && match[1]) {
                      individualTestCount = parseInt(match[1], 10);
                      console.log(`Job ${jobId} has ${individualTestCount} individual tests (from status)`);
                      break;
                    }
                  }
                } catch (e: unknown) {
                  // Ignore parsing errors
                }
              }
            } catch (e: unknown) {
              // Ignore errors getting status messages
            }
            
            // If we couldn't determine from status, try from job data
            if (individualTestCount === 0) {
              try {
                const jobData = await redisClient.hget(`bull:${JOB_EXECUTION_QUEUE}:${jobId}`, 'data');
                if (jobData) {
                  try {
                    const data = JSON.parse(jobData);
                    if (data.testScripts && Array.isArray(data.testScripts)) {
                      let estimatedTests = 0;
                      for (const script of data.testScripts) {
                        if (script.script && typeof script.script === 'string') {
                          const testMatches = (script.script.match(/\btest\s*\(/g) || []).length;
                          const itMatches = (script.script.match(/\bit\s*\(/g) || []).length;
                          const totalMatches = testMatches + itMatches;
                          
                          estimatedTests += totalMatches > 0 ? totalMatches : 1;
                        } else {
                          estimatedTests += 1;
                        }
                      }
                      individualTestCount = estimatedTests;
                      console.log(`Job ${jobId} has ${individualTestCount} tests (from script analysis)`);
                    } else if (data.testCount && typeof data.testCount === 'number') {
                      individualTestCount = data.testCount;
                      console.log(`Job ${jobId} has ${individualTestCount} tests (from testCount)`);
                    } else {
                      individualTestCount = 1;
                      console.log(`Job ${jobId} has at least 1 test (default)`);
                    }
                  } catch (e: unknown) {
                    individualTestCount = 1;
                  }
                } else {
                  individualTestCount = 1;
                }
              } catch (e: unknown) {
                individualTestCount = 1;
              }
            }
            
            runningCount += individualTestCount;
          }
        } catch (e: unknown) {
          // Ignore errors for individual jobs
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.log(`Error checking all jobs for processing status: ${errorMessage}`);
    }
    
    // Do the same for individual tests
    try {
      const testKeys = await redisClient.keys(`bull:${TEST_EXECUTION_QUEUE}:*`);
      const testIds = new Set<string>();
      
      for (const key of testKeys) {
        const parts = key.split(':');
        if (parts.length >= 3) {
          const id = parts[2];
          if (id && !['wait', 'active', 'completed', 'failed', 'delayed', 'paused', 'meta', 'events', 'stalled-check'].includes(id)) {
            testIds.add(id);
          }
        }
      }
      
      console.log(`Found ${testIds.size} total test IDs to check for processing status`);
      
      for (const testId of testIds) {
        // Skip if already processed
        if (processedRunningTests.has(testId)) continue;
        
        try {
          const processedOn = await redisClient.hget(`bull:${TEST_EXECUTION_QUEUE}:${testId}`, 'processedOn');
          const finishedOn = await redisClient.hget(`bull:${TEST_EXECUTION_QUEUE}:${testId}`, 'finishedOn');
          
          if (processedOn && !finishedOn) {
            processedRunningTests.add(testId);
            console.log(`Test ${testId} is being processed (detected via timestamps)`);
            
            // Try to get individual test count
            let individualTestCount = 0;
            
            try {
              const testData = await redisClient.hget(`bull:${TEST_EXECUTION_QUEUE}:${testId}`, 'data');
              if (testData) {
                try {
                  const data = JSON.parse(testData);
                  if (data.code && typeof data.code === 'string') {
                    const testMatches = (data.code.match(/\btest\s*\(/g) || []).length;
                    const itMatches = (data.code.match(/\bit\s*\(/g) || []).length;
                    const totalMatches = testMatches + itMatches;
                    
                    individualTestCount = totalMatches > 0 ? totalMatches : 1;
                  } else {
                    individualTestCount = 1;
                  }
                } catch (e: unknown) {
                  individualTestCount = 1;
                }
              } else {
                individualTestCount = 1;
              }
            } catch (e: unknown) {
              individualTestCount = 1;
            }
            
            runningCount += individualTestCount;
          }
        } catch (e: unknown) {
          // Ignore errors for individual tests
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.log(`Error checking all tests for processing status: ${errorMessage}`);
    }
    
    // Step 3: Check pub/sub channels as a final method to detect activity
    if (runningCount === 0) {
      try {
        const channels = await redisClient.pubsub('CHANNELS');
        const jobStatusChannels = channels.filter(ch => 
          typeof ch === 'string' && ch.startsWith('job-status:'));
        const testStatusChannels = channels.filter(ch => 
          typeof ch === 'string' && ch.startsWith('test-status:'));
        
        console.log(`Found ${jobStatusChannels.length} job status channels and ${testStatusChannels.length} test status channels`);
        
        // Try to extract test counts from status messages
        let channelTestCount = 0;
        
        for (const channel of jobStatusChannels as string[]) {
          try {
            const jobId = channel.substring('job-status:'.length);
            // Skip if already processed
            if (processedRunningJobs.has(jobId)) continue;
            
            const messages = await redisClient.lrange(channel, -5, -1);
            for (const msg of messages) {
              try {
                const statusData = JSON.parse(msg);
                if (statusData.message && typeof statusData.message === 'string') {
                  const match = statusData.message.match(/execution of (\d+) tests/i);
                  if (match && match[1]) {
                    channelTestCount += parseInt(match[1], 10);
                    processedRunningJobs.add(jobId);
                    break;
                  }
                }
              } catch (e: unknown) {
                // Ignore parsing errors
              }
            }
          } catch (e: unknown) {
            // Ignore errors getting messages
          }
        }
        
        for (const channel of testStatusChannels as string[]) {
          try {
            const testId = channel.substring('test-status:'.length);
            // Skip if already processed
            if (processedRunningTests.has(testId)) continue;
            
            // Just add 1 per test channel that hasn't been counted yet
            channelTestCount += 1;
            processedRunningTests.add(testId);
          } catch (e: unknown) {
            // Ignore errors
          }
        }
        
        if (channelTestCount > 0) {
          runningCount = channelTestCount;
        } else if (jobStatusChannels.length > 0 || testStatusChannels.length > 0) {
          // If we couldn't get test counts but have channels, estimate based on channels
          const jobChannelCount = jobStatusChannels.length > 0 ? 
            (jobStatusChannels as string[]).filter(ch => !processedRunningJobs.has(ch.substring('job-status:'.length))).length : 0;
          
          const testChannelCount = testStatusChannels.length > 0 ? 
            (testStatusChannels as string[]).filter(ch => !processedRunningTests.has(ch.substring('test-status:'.length))).length : 0;
            
          if (jobChannelCount > 0 || testChannelCount > 0) {
            runningCount = Math.max(runningCount, jobChannelCount * 3 + testChannelCount);
            console.log(`Setting minimum running count to ${runningCount} based on unprocessed status channels`);
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.log(`Error checking pub/sub channels: ${errorMessage}`);
      }
    }
    
    // Step 4: Count queued jobs/tests once we've determined all currently running
    if (runningCount >= RUNNING_CAPACITY) {
      // If we've hit capacity, count queued items
      try {
        const waitingJobs = await redisClient.lrange(`bull:${JOB_EXECUTION_QUEUE}:wait`, 0, -1);
        console.log(`Found ${waitingJobs.length} queued jobs`);
        
        for (const jobId of waitingJobs) {
          if (processedQueuedJobs.has(jobId)) continue;
          processedQueuedJobs.add(jobId);
          
          try {
            const jobData = await redisClient.hget(`bull:${JOB_EXECUTION_QUEUE}:${jobId}`, 'data');
            if (jobData) {
              try {
                const data = JSON.parse(jobData);
                
                if (data.testScripts && Array.isArray(data.testScripts)) {
                  let estimatedTests = 0;
                  for (const script of data.testScripts) {
                    if (script.script && typeof script.script === 'string') {
                      const testMatches = (script.script.match(/\btest\s*\(/g) || []).length;
                      const itMatches = (script.script.match(/\bit\s*\(/g) || []).length;
                      const totalMatches = testMatches + itMatches;
                      
                      estimatedTests += totalMatches > 0 ? totalMatches : 1;
                    } else {
                      estimatedTests += 1;
                    }
                  }
                  queuedCount += estimatedTests;
                  console.log(`Queued job ${jobId} has approximately ${estimatedTests} tests`);
                } else if (data.testCount && typeof data.testCount === 'number') {
                  queuedCount += data.testCount;
                  console.log(`Queued job ${jobId} has ${data.testCount} tests`);
                } else {
                  queuedCount += 1;
                  console.log(`Queued job ${jobId} has at least 1 test (default)`);
                }
              } catch (e: unknown) {
                queuedCount += 1;
              }
            } else {
              queuedCount += 1;
            }
          } catch (e: unknown) {
            queuedCount += 1;
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.log(`Error getting queued jobs: ${errorMessage}`);
      }
      
      try {
        const waitingTests = await redisClient.lrange(`bull:${TEST_EXECUTION_QUEUE}:wait`, 0, -1);
        console.log(`Found ${waitingTests.length} queued individual tests`);
        
        for (const testId of waitingTests) {
          if (processedQueuedTests.has(testId)) continue;
          processedQueuedTests.add(testId);
          
          try {
            const testData = await redisClient.hget(`bull:${TEST_EXECUTION_QUEUE}:${testId}`, 'data');
            if (testData) {
              try {
                const data = JSON.parse(testData);
                if (data.code && typeof data.code === 'string') {
                  const testMatches = (data.code.match(/\btest\s*\(/g) || []).length;
                  const itMatches = (data.code.match(/\bit\s*\(/g) || []).length;
                  const totalMatches = testMatches + itMatches;
                  
                  queuedCount += totalMatches > 0 ? totalMatches : 1;
                  console.log(`Queued test ${testId} has ${totalMatches > 0 ? totalMatches : 1} tests`);
                } else {
                  queuedCount += 1;
                  console.log(`Queued test ${testId} has at least 1 test (default)`);
                }
              } catch (e: unknown) {
                queuedCount += 1;
              }
            } else {
              queuedCount += 1;
            }
          } catch (e: unknown) {
            queuedCount += 1;
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.log(`Error getting queued tests: ${errorMessage}`);
      }
    } else {
      // If we haven't hit capacity, check for waiting jobs/tests that should be counted as running
      const remainingCapacity = RUNNING_CAPACITY - runningCount;
      
      if (remainingCapacity > 0) {
        let runningAddedFromQueue = 0;
        
        // First add from waiting jobs
        try {
          const waitingJobs = await redisClient.lrange(`bull:${JOB_EXECUTION_QUEUE}:wait`, 0, -1);
          console.log(`Found ${waitingJobs.length} waiting jobs to potentially add to running count`);
          
          for (const jobId of waitingJobs) {
            if (processedRunningJobs.has(jobId) || processedQueuedJobs.has(jobId)) continue;
            
            try {
              const jobData = await redisClient.hget(`bull:${JOB_EXECUTION_QUEUE}:${jobId}`, 'data');
              let jobTestCount = 0;
              
              if (jobData) {
                try {
                  const data = JSON.parse(jobData);
                  
                  if (data.testScripts && Array.isArray(data.testScripts)) {
                    let estimatedTests = 0;
                    for (const script of data.testScripts) {
                      if (script.script && typeof script.script === 'string') {
                        const testMatches = (script.script.match(/\btest\s*\(/g) || []).length;
                        const itMatches = (script.script.match(/\bit\s*\(/g) || []).length;
                        const totalMatches = testMatches + itMatches;
                        
                        estimatedTests += totalMatches > 0 ? totalMatches : 1;
                      } else {
                        estimatedTests += 1;
                      }
                    }
                    jobTestCount = estimatedTests;
                  } else if (data.testCount && typeof data.testCount === 'number') {
                    jobTestCount = data.testCount;
                  } else {
                    jobTestCount = 1;
                  }
                } catch (e: unknown) {
                  jobTestCount = 1;
                }
              } else {
                jobTestCount = 1;
              }
              
              // Add job to running or queued
              if (runningAddedFromQueue + jobTestCount <= remainingCapacity) {
                runningAddedFromQueue += jobTestCount;
                processedRunningJobs.add(jobId);
                console.log(`Added waiting job ${jobId} with ${jobTestCount} tests to running count`);
              } else {
                // This job would exceed capacity
                processedQueuedJobs.add(jobId);
                queuedCount += jobTestCount;
                console.log(`Queued job ${jobId} with ${jobTestCount} tests (exceeds capacity)`);
              }
            } catch (e: unknown) {
              // Use default 1 test
              if (runningAddedFromQueue + 1 <= remainingCapacity) {
                runningAddedFromQueue += 1;
                processedRunningJobs.add(jobId);
              } else {
                processedQueuedJobs.add(jobId);
                queuedCount += 1;
              }
            }
          }
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.log(`Error processing waiting jobs for running/queued counts: ${errorMessage}`);
        }
        
        // Then add from waiting tests if capacity remains
        if (runningAddedFromQueue < remainingCapacity) {
          try {
            const waitingTests = await redisClient.lrange(`bull:${TEST_EXECUTION_QUEUE}:wait`, 0, -1);
            console.log(`Found ${waitingTests.length} waiting tests to potentially add to running count`);
            
            for (const testId of waitingTests) {
              if (processedRunningTests.has(testId) || processedQueuedTests.has(testId)) continue;
              
              try {
                const testData = await redisClient.hget(`bull:${TEST_EXECUTION_QUEUE}:${testId}`, 'data');
                let testCount = 0;
                
                if (testData) {
                  try {
                    const data = JSON.parse(testData);
                    
                    if (data.code && typeof data.code === 'string') {
                      const testMatches = (data.code.match(/\btest\s*\(/g) || []).length;
                      const itMatches = (data.code.match(/\bit\s*\(/g) || []).length;
                      const totalMatches = testMatches + itMatches;
                      
                      testCount = totalMatches > 0 ? totalMatches : 1;
                    } else {
                      testCount = 1;
                    }
                  } catch (e: unknown) {
                    testCount = 1;
                  }
                } else {
                  testCount = 1;
                }
                
                // Add test to running or queued
                if (runningAddedFromQueue + testCount <= remainingCapacity) {
                  runningAddedFromQueue += testCount;
                  processedRunningTests.add(testId);
                  console.log(`Added waiting test ${testId} with ${testCount} tests to running count`);
                } else {
                  // This test would exceed capacity
                  processedQueuedTests.add(testId);
                  queuedCount += testCount;
                  console.log(`Queued test ${testId} with ${testCount} tests (exceeds capacity)`);
                }
              } catch (e: unknown) {
                // Use default 1 test
                if (runningAddedFromQueue + 1 <= remainingCapacity) {
                  runningAddedFromQueue += 1;
                  processedRunningTests.add(testId);
                } else {
                  processedQueuedTests.add(testId);
                  queuedCount += 1;
                }
              }
            }
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.log(`Error processing waiting tests for running/queued counts: ${errorMessage}`);
          }
        }
        
        // Update running count with items from queue that fit within capacity
        runningCount += runningAddedFromQueue;
      }
    }
    
    // Step 5: Check delayed queue items and add to queued count
    try {
      const delayedJobs = await redisClient.zrange(`bull:${JOB_EXECUTION_QUEUE}:delayed`, 0, -1);
      const delayedTests = await redisClient.zrange(`bull:${TEST_EXECUTION_QUEUE}:delayed`, 0, -1);
      
      console.log(`Found ${delayedJobs.length} delayed jobs and ${delayedTests.length} delayed tests`);
      
      // Process delayed jobs that haven't been counted yet
      for (const jobId of delayedJobs) {
        if (processedRunningJobs.has(jobId) || processedQueuedJobs.has(jobId)) continue;
        processedQueuedJobs.add(jobId);
        
        try {
          const jobData = await redisClient.hget(`bull:${JOB_EXECUTION_QUEUE}:${jobId}`, 'data');
          let jobTestCount = 0;
          
          if (jobData) {
            try {
              const data = JSON.parse(jobData);
              
              if (data.testScripts && Array.isArray(data.testScripts)) {
                let estimatedTests = 0;
                for (const script of data.testScripts) {
                  if (script.script && typeof script.script === 'string') {
                    const testMatches = (script.script.match(/\btest\s*\(/g) || []).length;
                    const itMatches = (script.script.match(/\bit\s*\(/g) || []).length;
                    const totalMatches = testMatches + itMatches;
                    
                    estimatedTests += totalMatches > 0 ? totalMatches : 1;
                  } else {
                    estimatedTests += 1;
                  }
                }
                jobTestCount = estimatedTests;
              } else if (data.testCount && typeof data.testCount === 'number') {
                jobTestCount = data.testCount;
              } else {
                jobTestCount = 1;
              }
            } catch (e: unknown) {
              jobTestCount = 1;
            }
          } else {
            jobTestCount = 1;
          }
          
          queuedCount += jobTestCount;
        } catch (e: unknown) {
          queuedCount += 1;
        }
      }
      
      // Process delayed tests that haven't been counted yet
      for (const testId of delayedTests) {
        if (processedRunningTests.has(testId) || processedQueuedTests.has(testId)) continue;
        processedQueuedTests.add(testId);
        
        try {
          const testData = await redisClient.hget(`bull:${TEST_EXECUTION_QUEUE}:${testId}`, 'data');
          let testCount = 0;
          
          if (testData) {
            try {
              const data = JSON.parse(testData);
              
              if (data.code && typeof data.code === 'string') {
                const testMatches = (data.code.match(/\btest\s*\(/g) || []).length;
                const itMatches = (data.code.match(/\bit\s*\(/g) || []).length;
                const totalMatches = testMatches + itMatches;
                
                testCount = totalMatches > 0 ? totalMatches : 1;
              } else {
                testCount = 1;
              }
            } catch (e: unknown) {
              testCount = 1;
            }
          } else {
            testCount = 1;
          }
          
          queuedCount += testCount;
        } catch (e: unknown) {
          queuedCount += 1;
        }
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.log(`Error processing delayed jobs/tests: ${errorMessage}`);
    }
    
    console.log(`Final queue stats: running=${runningCount}, queued=${queuedCount}`);
    console.log(`Processed ${processedRunningJobs.size} running jobs and ${processedRunningTests.size} running tests`);
    console.log(`Processed ${processedQueuedJobs.size} queued jobs and ${processedQueuedTests.size} queued tests`);
    
    return {
      running: Math.min(runningCount, RUNNING_CAPACITY),
      runningCapacity: RUNNING_CAPACITY,
      queued: queuedCount,
      queuedCapacity: QUEUED_CAPACITY,
    };
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    throw error;
  } finally {
    // Always close Redis connection
    await redisClient.quit().catch(err => {
      console.warn('Error closing Redis connection:', err);
    });
  }
}

/**
 * Generate mock queue statistics for development or when Redis is unavailable
 */
export function generateMockQueueStats(): QueueStats {
  // Generate semi-realistic mock data
  const timestamp = Date.now();
  
  // Make running jobs fluctuate over time but with realistic distribution
  const timeOfDay = Math.floor((timestamp % 86400000) / 3600000); // 0-23 based on hour of day
  
  // More threads during business hours (8-18), fewer at night
  let loadFactor = 0.3;
  if (timeOfDay >= 8 && timeOfDay <= 18) {
    loadFactor = 0.6 + (Math.sin((timeOfDay - 8) / 10 * Math.PI) * 0.3); // Peak at ~1pm
  }
  
  // Calculate running threads based on load factor
  const runningBase = Math.floor(RUNNING_CAPACITY * loadFactor);
  const runningNoise = Math.floor(Math.random() * 10) - 5; // -5 to +5 noise
  const running = Math.min(RUNNING_CAPACITY, Math.max(1, runningBase + runningNoise)); // Ensure at least 1
  
  // Only show queued if we're at capacity
  let queued = 0;
  if (running >= RUNNING_CAPACITY * 0.95) { // Near capacity, some queuing
    const queuedBase = Math.floor(Math.random() * 20); // 0-20 range for queued
    queued = queuedBase;
  }
  
  return {
    running,
    runningCapacity: RUNNING_CAPACITY,
    queued,
    queuedCapacity: QUEUED_CAPACITY,
  };
}

/**
 * Get queue statistics with fallback to zeros
 */
export async function getQueueStats(): Promise<QueueStats> {
  try {
    return await fetchQueueStats();
  } catch (error) {
    console.error('Error fetching real queue stats:', error);
    // Return zeros rather than mock data
    return {
      running: 0,
      runningCapacity: RUNNING_CAPACITY,
      queued: 0,
      queuedCapacity: QUEUED_CAPACITY
    };
  }
} 