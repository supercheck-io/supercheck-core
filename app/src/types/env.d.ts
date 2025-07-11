declare namespace NodeJS {
  interface ProcessEnv {
    // Database
    DATABASE_URL: string;
    DB_HOST: string;
    DB_PORT: string;
    DB_USER: string;
    DB_PASSWORD: string;
    DB_NAME: string;

    // AWS S3 / MinIO Configuration
    AWS_REGION: string;
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    S3_ENDPOINT: string;
    S3_JOB_BUCKET_NAME: string;
    S3_FORCE_PATH_STYLE: string;
    S3_OPERATION_TIMEOUT: string;
    S3_MAX_RETRIES: string;

    // App Config
    RUNNING_CAPACITY: string;
    QUEUED_CAPACITY: string;
    TEST_EXECUTION_TIMEOUT_MS: string;
    TRACE_RECOVERY_INTERVAL_MS: string;

    // Playwright Config
    PLAYWRIGHT_RETRIES: string;
    PLAYWRIGHT_WORKERS: string;
  }
} 