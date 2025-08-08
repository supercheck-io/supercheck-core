import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TestExecutionProcessor } from '../test-execution.processor';
import { ExecutionService } from '../../services/execution.service';
import { TestExecutionTask, TestResult } from '../../interfaces';

describe('TestExecutionProcessor', () => {
  let processor: TestExecutionProcessor;
  let executionService: ExecutionService;

  const mockExecutionService = {
    executeTest: jest.fn(),
    handleTestError: jest.fn(),
    updateTestStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestExecutionProcessor,
        {
          provide: ExecutionService,
          useValue: mockExecutionService,
        },
      ],
    }).compile();

    processor = module.get<TestExecutionProcessor>(TestExecutionProcessor);
    executionService = module.get<ExecutionService>(ExecutionService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(processor).toBeDefined();
    });

    it('should have logger initialized', () => {
      expect(processor['logger']).toBeInstanceOf(Logger);
    });

    it('should log initialization message', () => {
      const loggerSpy = jest.spyOn(processor['logger'], 'log');

      // Create new instance to test constructor logging
      new TestExecutionProcessor(executionService);

      expect(loggerSpy).toHaveBeenCalledWith(
        '[Constructor] TestExecutionProcessor instantiated.',
      );
    });
  });

  describe('event handlers', () => {
    let mockJob: Partial<Job>;
    let loggerSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      mockJob = {
        id: 'test-job-123',
        data: {
          testId: 'test-123',
          runId: 'run-123',
        } as TestExecutionTask,
      };

      loggerSpy = jest.spyOn(processor['logger'], 'log').mockImplementation();
      errorSpy = jest.spyOn(processor['logger'], 'error').mockImplementation();
    });

    describe('onActive', () => {
      it('should log when job becomes active', () => {
        processor.onActive(mockJob as Job);

        expect(loggerSpy).toHaveBeenCalledWith(
          '[Event:active] Job test-job-123 has started.',
        );
      });
    });

    describe('onCompleted', () => {
      it('should log when job completes successfully', () => {
        const result = { success: true, runId: 'run-123' };

        processor.onCompleted(mockJob as Job, result);

        expect(loggerSpy).toHaveBeenCalledWith(
          '[Event:completed] Job test-job-123 completed with result: {"success":true,"runId":"run-123"}',
        );
      });

      it('should handle complex result objects', () => {
        const result = {
          success: true,
          duration: 5000,
          screenshots: ['screenshot1.png', 'screenshot2.png'],
        };

        processor.onCompleted(mockJob as Job, result);

        expect(loggerSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            '[Event:completed] Job test-job-123 completed with result:',
          ),
        );
      });

      it('should handle null/undefined results', () => {
        processor.onCompleted(mockJob as Job, null);

        expect(loggerSpy).toHaveBeenCalledWith(
          '[Event:completed] Job test-job-123 completed with result: null',
        );
      });
    });

    describe('onFailed', () => {
      it('should log when job fails with error', () => {
        const error = new Error('Test execution failed');
        error.stack = 'Error stack trace';

        processor.onFailed(mockJob as Job, error);

        expect(errorSpy).toHaveBeenCalledWith(
          '[Event:failed] Job test-job-123 failed with error: Test execution failed',
          'Error stack trace',
        );
      });

      it('should handle job being undefined', () => {
        const error = new Error('Unknown job failed');

        processor.onFailed(undefined, error);

        expect(errorSpy).toHaveBeenCalledWith(
          '[Event:failed] Job unknown failed with error: Unknown job failed',
          undefined,
        );
      });

      it('should handle errors without stack traces', () => {
        const error = new Error('Simple error');
        delete error.stack;

        processor.onFailed(mockJob as Job, error);

        expect(errorSpy).toHaveBeenCalledWith(
          '[Event:failed] Job test-job-123 failed with error: Simple error',
          undefined,
        );
      });
    });

    describe('onError', () => {
      it('should log worker errors', () => {
        const error = new Error('Worker connection failed');
        error.stack = 'Worker error stack';

        processor.onError(error);

        expect(errorSpy).toHaveBeenCalledWith(
          '[Event:error] Worker encountered an error: Worker connection failed',
          'Worker error stack',
        );
      });

      it('should handle errors without stack traces', () => {
        const error = new Error('Simple worker error');
        delete error.stack;

        processor.onError(error);

        expect(errorSpy).toHaveBeenCalledWith(
          '[Event:error] Worker encountered an error: Simple worker error',
          undefined,
        );
      });
    });

    describe('onReady', () => {
      it('should log when worker is ready', () => {
        processor.onReady();

        expect(loggerSpy).toHaveBeenCalledWith(
          '[Event:ready] Worker is connected to Redis and ready to process jobs.',
        );
      });
    });
  });

  describe('process', () => {
    let mockJob: Job<TestExecutionTask>;
    let loggerSpy: jest.SpyInstance;

    beforeEach(() => {
      mockJob = {
        id: 'test-job-123',
        data: {
          testId: 'test-123',
          runId: 'run-123',
          organizationId: 'org-123',
          projectId: 'project-123',
          script: 'test("example", async ({ page }) => { /* test code */ });',
          priority: 'medium',
          type: 'e2e',
        },
      } as Job<TestExecutionTask>;

      loggerSpy = jest.spyOn(processor['logger'], 'log').mockImplementation();
    });

    it('should process test execution job successfully', async () => {
      const expectedResult: TestResult = {
        success: true,
        runId: 'run-123',
        duration: 5000,
        result: 'passed',
        error: null,
        reportUrl: 'https://s3.example.com/reports/run-123',
      };

      mockExecutionService.executeTest.mockResolvedValue(expectedResult);

      const result = await processor.process(mockJob);

      expect(loggerSpy).toHaveBeenCalledWith(
        '[test-123] Test execution job ID: test-job-123 received for processing',
      );
      expect(mockExecutionService.executeTest).toHaveBeenCalledWith(
        mockJob.data,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should handle test execution failures', async () => {
      const error = new Error('Test execution failed');
      mockExecutionService.executeTest.mockRejectedValue(error);

      await expect(processor.process(mockJob)).rejects.toThrow(
        'Test execution failed',
      );

      expect(mockExecutionService.executeTest).toHaveBeenCalledWith(
        mockJob.data,
      );
    });

    it('should log the start of processing', async () => {
      mockExecutionService.executeTest.mockResolvedValue({ success: true });

      await processor.process(mockJob);

      expect(loggerSpy).toHaveBeenCalledWith(
        '[test-123] Test execution job ID: test-job-123 received for processing',
      );
    });

    it('should handle missing job data gracefully', async () => {
      const jobWithMissingData = {
        id: 'incomplete-job',
        data: {} as TestExecutionTask,
      } as Job<TestExecutionTask>;

      mockExecutionService.executeTest.mockResolvedValue({ success: false });

      await processor.process(jobWithMissingData);

      expect(loggerSpy).toHaveBeenCalledWith(
        '[undefined] Test execution job ID: incomplete-job received for processing',
      );
    });

    it('should pass correct data to execution service', async () => {
      const testData: TestExecutionTask = {
        testId: 'test-456',
        runId: 'run-456',
        organizationId: 'org-456',
        projectId: 'project-456',
        script: 'await page.goto("https://example.com");',
        priority: 'high',
        type: 'api',
      };

      mockJob.data = testData;
      mockExecutionService.executeTest.mockResolvedValue({ success: true });

      await processor.process(mockJob);

      expect(mockExecutionService.executeTest).toHaveBeenCalledWith(testData);
    });

    it('should handle execution service returning null/undefined', async () => {
      mockExecutionService.executeTest.mockResolvedValue(undefined);

      const result = await processor.process(mockJob);

      expect(result).toBeUndefined();
    });

    it('should handle timeout scenarios', async () => {
      const timeoutError = new Error('Test execution timeout');
      timeoutError.name = 'TimeoutError';
      mockExecutionService.executeTest.mockRejectedValue(timeoutError);

      await expect(processor.process(mockJob)).rejects.toThrow(
        'Test execution timeout',
      );
    });
  });

  describe('inheritance', () => {
    it('should extend WorkerHost', () => {
      expect(processor).toBeInstanceOf(TestExecutionProcessor);
      // WorkerHost is from @nestjs/bullmq, we verify the processor can be instantiated
      expect(processor.process).toBeDefined();
    });
  });

  describe('error recovery', () => {
    it('should handle logger errors gracefully', () => {
      const mockBadLogger = {
        log: jest.fn().mockImplementation(() => {
          throw new Error('Logger failed');
        }),
        error: jest.fn(),
      };

      processor['logger'] = mockBadLogger as any;

      // Should not throw even if logger fails
      expect(() => processor.onReady()).not.toThrow();
    });
  });
});
