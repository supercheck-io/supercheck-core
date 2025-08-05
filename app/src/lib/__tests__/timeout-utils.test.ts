import { 
  detectTimeoutError, 
  getTimeoutErrorMessages, 
  getTimeoutActions,
  TimeoutErrorInfo 
} from '../timeout-utils';

describe('timeout-utils', () => {
  describe('detectTimeoutError', () => {
    describe('no timeout scenarios', () => {
      it('should return default result for empty inputs', () => {
        const result = detectTimeoutError(null, null, null);
        expect(result).toEqual({
          isTimeout: false,
          timeoutType: 'unknown',
          timeoutDurationMs: 0,
          timeoutDurationMinutes: 0,
        });
      });

      it('should return default result for non-timeout error', () => {
        const result = detectTimeoutError('Some other error occurred');
        expect(result).toEqual({
          isTimeout: false,
          timeoutType: 'unknown',
          timeoutDurationMs: 0,
          timeoutDurationMinutes: 0,
        });
      });

      it('should return default result for empty strings', () => {
        const result = detectTimeoutError('', '', '');
        expect(result).toEqual({
          isTimeout: false,
          timeoutType: 'unknown',
          timeoutDurationMs: 0,
          timeoutDurationMinutes: 0,
        });
      });
    });

    describe('timeout detection with duration', () => {
      it('should detect "execution timed out after Xms" pattern', () => {
        const result = detectTimeoutError('execution timed out after 120000ms');
        expect(result).toEqual({
          isTimeout: true,
          timeoutType: 'test',
          timeoutDurationMs: 120000,
          timeoutDurationMinutes: 2,
        });
      });

      it('should detect "timed out after Xms" pattern', () => {
        const result = detectTimeoutError('Test timed out after 900000ms');
        expect(result).toEqual({
          isTimeout: true,
          timeoutType: 'job',
          timeoutDurationMs: 900000,
          timeoutDurationMinutes: 15,
        });
      });

      it('should detect "timeout after Xms" pattern', () => {
        const result = detectTimeoutError('Process timeout after 30000ms');
        expect(result).toEqual({
          isTimeout: true,
          timeoutType: 'test',
          timeoutDurationMs: 30000,
          timeoutDurationMinutes: 0,
        });
      });

      it('should handle custom timeout durations', () => {
        const result = detectTimeoutError('execution timed out after 600000ms');
        expect(result).toEqual({
          isTimeout: true,
          timeoutType: 'job',
          timeoutDurationMs: 600000,
          timeoutDurationMinutes: 10,
        });
      });
    });

    describe('timeout detection without explicit duration', () => {
      it('should detect "execution timeout" pattern and infer test timeout', () => {
        const result = detectTimeoutError('execution timeout occurred with 120000ms');
        expect(result).toEqual({
          isTimeout: true,
          timeoutType: 'test',
          timeoutDurationMs: 120000,
          timeoutDurationMinutes: 2,
        });
      });

      it('should detect "[execution timeout]" pattern and infer job timeout', () => {
        const result = detectTimeoutError('[execution timeout] failed after 900000');
        expect(result).toEqual({
          isTimeout: true,
          timeoutType: 'job',
          timeoutDurationMs: 900000,
          timeoutDurationMinutes: 15,
        });
      });

      it('should detect timeout without duration inference', () => {
        const result = detectTimeoutError('execution timeout');
        expect(result).toEqual({
          isTimeout: true,
          timeoutType: 'unknown',
          timeoutDurationMs: 0,
          timeoutDurationMinutes: 0,
        });
      });
    });

    describe('timeout type classification', () => {
      it('should classify 120000ms as test timeout', () => {
        const result = detectTimeoutError('timed out after 120000ms');
        expect(result.timeoutType).toBe('test');
      });

      it('should classify 900000ms as job timeout', () => {
        const result = detectTimeoutError('timed out after 900000ms');
        expect(result.timeoutType).toBe('job');
      });

      it('should classify ≤2 minutes as test timeout', () => {
        const result = detectTimeoutError('timed out after 60000ms');
        expect(result.timeoutType).toBe('test');
      });

      it('should classify ≥10 minutes as job timeout', () => {
        const result = detectTimeoutError('timed out after 600000ms');
        expect(result.timeoutType).toBe('job');
      });

      it('should classify intermediate durations as unknown', () => {
        const result = detectTimeoutError('timed out after 300000ms'); // 5 minutes
        expect(result.timeoutType).toBe('unknown');
      });
    });

    describe('multiple input sources', () => {
      it('should check stderr for timeout patterns', () => {
        const result = detectTimeoutError(null, 'execution timed out after 120000ms', null);
        expect(result.isTimeout).toBe(true);
        expect(result.timeoutDurationMs).toBe(120000);
      });

      it('should check stdout for timeout patterns', () => {
        const result = detectTimeoutError(null, null, 'Test timed out after 900000ms');
        expect(result.isTimeout).toBe(true);
        expect(result.timeoutDurationMs).toBe(900000);
      });

      it('should combine all sources when checking patterns', () => {
        const result = detectTimeoutError(
          'Some error occurred',
          'timeout after',
          '120000ms exceeded'
        );
        expect(result.isTimeout).toBe(true);
      });

      it('should be case insensitive', () => {
        const result = detectTimeoutError('EXECUTION TIMED OUT AFTER 120000MS');
        expect(result.isTimeout).toBe(true);
        expect(result.timeoutDurationMs).toBe(120000);
      });
    });

    describe('edge cases', () => {
      it('should handle malformed duration numbers', () => {
        const result = detectTimeoutError('timed out after abcms');
        expect(result.isTimeout).toBe(true);
        expect(result.timeoutDurationMs).toBe(0);
      });

      it('should handle very large timeouts', () => {
        const result = detectTimeoutError('timed out after 3600000ms'); // 1 hour
        expect(result).toEqual({
          isTimeout: true,
          timeoutType: 'job',
          timeoutDurationMs: 3600000,
          timeoutDurationMinutes: 60,
        });
      });
    });
  });

  describe('getTimeoutErrorMessages', () => {
    describe('non-timeout errors', () => {
      it('should return generic error messages for non-timeout', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: false,
          timeoutType: 'unknown',
          timeoutDurationMs: 0,
          timeoutDurationMinutes: 0,
        };

        const result = getTimeoutErrorMessages(timeoutInfo);
        expect(result).toEqual({
          title: 'Execution Failed',
          message: 'The execution encountered an error.',
          suggestion: 'Please check your script and try again.',
        });
      });
    });

    describe('test timeout messages', () => {
      it('should return test timeout messages with duration', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'test',
          timeoutDurationMs: 120000,
          timeoutDurationMinutes: 2,
        };

        const result = getTimeoutErrorMessages(timeoutInfo);
        expect(result.title).toBe('Test Execution Timeout');
        expect(result.message).toBe('Your test script timed out after 2 minutes.');
        expect(result.suggestion).toContain('infinite loops');
        expect(result.suggestion).toContain('explicit waits');
      });

      it('should handle singular minute correctly', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'test',
          timeoutDurationMs: 60000,
          timeoutDurationMinutes: 1,
        };

        const result = getTimeoutErrorMessages(timeoutInfo);
        expect(result.message).toBe('Your test script timed out after 1 minute.');
      });

      it('should default to 2 minutes for test timeout without duration', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'test',
          timeoutDurationMs: 0,
          timeoutDurationMinutes: 0,
        };

        const result = getTimeoutErrorMessages(timeoutInfo);
        expect(result.message).toBe('Your test script timed out after 2 minutes.');
      });
    });

    describe('job timeout messages', () => {
      it('should return job timeout messages with duration', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'job',
          timeoutDurationMs: 900000,
          timeoutDurationMinutes: 15,
        };

        const result = getTimeoutErrorMessages(timeoutInfo);
        expect(result.title).toBe('Job Execution Timeout');
        expect(result.message).toBe('Your job execution timed out after 15 minutes.');
        expect(result.suggestion).toContain('splitting large test suites');
        expect(result.suggestion).toContain('resource-heavy operations');
      });

      it('should default to 15 minutes for job timeout without duration', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'job',
          timeoutDurationMs: 0,
          timeoutDurationMinutes: 0,
        };

        const result = getTimeoutErrorMessages(timeoutInfo);
        expect(result.message).toBe('Your job execution timed out after 15 minutes.');
      });
    });

    describe('unknown timeout messages', () => {
      it('should return generic timeout messages for unknown type', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'unknown',
          timeoutDurationMs: 300000,
          timeoutDurationMinutes: 5,
        };

        const result = getTimeoutErrorMessages(timeoutInfo);
        expect(result.title).toBe('Execution Timeout');
        expect(result.message).toBe('The execution timed out after 5 minutes.');
        expect(result.suggestion).toBe('Please review your script for performance issues and try again.');
      });
    });
  });

  describe('getTimeoutActions', () => {
    const baseActions = [
      'Review your script for infinite loops',
      'Check for slow network requests',
      'Optimize selector strategies',
    ];

    describe('test timeout actions', () => {
      it('should return test-specific actions', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'test',
          timeoutDurationMs: 120000,
          timeoutDurationMinutes: 2,
        };

        const result = getTimeoutActions(timeoutInfo);
        expect(result).toEqual([
          ...baseActions,
          'Add explicit waits instead of hard delays',
          'Reduce test complexity',
          'Consider splitting complex tests',
        ]);
      });
    });

    describe('job timeout actions', () => {
      it('should return job-specific actions', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'job',
          timeoutDurationMs: 900000,
          timeoutDurationMinutes: 15,
        };

        const result = getTimeoutActions(timeoutInfo);
        expect(result).toEqual([
          ...baseActions,
          'Break down large test suites',
          'Optimize test execution order',
          'Review parallel execution settings',
          'Consider test suite organization',
        ]);
      });
    });

    describe('unknown timeout actions', () => {
      it('should return base actions for unknown timeout type', () => {
        const timeoutInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'unknown',
          timeoutDurationMs: 300000,
          timeoutDurationMinutes: 5,
        };

        const result = getTimeoutActions(timeoutInfo);
        expect(result).toEqual(baseActions);
      });
    });

    describe('base actions consistency', () => {
      it('should include base actions in all timeout types', () => {
        const testInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'test',
          timeoutDurationMs: 120000,
          timeoutDurationMinutes: 2,
        };

        const jobInfo: TimeoutErrorInfo = {
          isTimeout: true,
          timeoutType: 'job',
          timeoutDurationMs: 900000,
          timeoutDurationMinutes: 15,
        };

        const testActions = getTimeoutActions(testInfo);
        const jobActions = getTimeoutActions(jobInfo);

        baseActions.forEach(action => {
          expect(testActions).toContain(action);
          expect(jobActions).toContain(action);
        });
      });
    });
  });
});