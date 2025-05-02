// Interfaces migrated from the original project and processor definitions

// Result of a single test execution
export interface TestResult {
  success: boolean;
  error: string | null;
  reportUrl: string | null; // This might become an S3 URL/key
  testId: string;
  stdout: string;
  stderr: string;
}

// Represents a test script to be executed as part of a job
export interface TestScript {
  id: string;
  script: string;
  name?: string;
}

// Result of executing multiple tests (a job)
export interface TestExecutionResult {
  jobId: string;
  success: boolean;
  error?: string | null;
  reportUrl: string | null; // This might become an S3 URL/key
  results: Array<{
    testId: string;
    success: boolean;
    error: string | null;
    // Individual report URLs might not be relevant if there's one job report
    reportUrl?: string | null; // Use job report URL
  }>;
  timestamp: string;
  stdout?: string;
  stderr?: string;
}

// Task data for the test execution queue
export interface TestExecutionTask {
  testId: string;
  // Consider passing the code directly instead of a path
  // as the worker service doesn't share the filesystem
  code: string; 
  // testPath: string; // Original field - needs adaptation
}

// Task data for the job execution queue
export interface JobExecutionTask {
  jobId: string;
  testScripts: TestScript[];
  runId: string; // Required run ID to distinguish parallel executions of the same job
}

// Optional: Interface for database report metadata storage
export interface ReportMetadata {
  entityId: string;
  entityType: "test" | "job";
  reportPath: string; // This might be the S3 key/path
  status: "pending" | "running" | "completed" | "failed";
  s3Url?: string; // Explicitly store the final S3 URL
  createdAt?: Date;
  updatedAt?: Date;
} 