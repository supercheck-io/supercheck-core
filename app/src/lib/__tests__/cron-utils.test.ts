import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { getNextRunDate, formatNextRunDate } from '../cron-utils';

// Mock cron-parser to control the behavior in tests
jest.mock('cron-parser', () => ({
  CronExpressionParser: {
    parse: jest.fn(),
  },
}));

describe('cron-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.error to avoid noise in test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  describe('getNextRunDate', () => {
    it('should return null for null input', () => {
      const result = getNextRunDate(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = getNextRunDate(undefined);
      expect(result).toBeNull();
    });

    it('should return null for empty string input', () => {
      const result = getNextRunDate('');
      expect(result).toBeNull();
    });

    it('should return next run date for valid cron expression', () => {
      const mockDate = new Date('2024-01-01T12:00:00Z');
      const mockExpression = {
        next: jest.fn().mockReturnValue({
          toDate: jest.fn().mockReturnValue(mockDate),
        }),
      };

      const { CronExpressionParser } = jest.requireMock('cron-parser') as { CronExpressionParser: { parse: jest.Mock } };
      CronExpressionParser.parse.mockReturnValue(mockExpression);

      const result = getNextRunDate('0 9 * * *');

      expect(result).toBe(mockDate);
      expect(CronExpressionParser.parse).toHaveBeenCalledWith('0 9 * * *', {
        currentDate: expect.any(Date),
        tz: 'UTC',
      });
    });

    it('should handle invalid cron expressions gracefully', () => {
      const { CronExpressionParser } = jest.requireMock('cron-parser') as { CronExpressionParser: { parse: jest.Mock } };
      CronExpressionParser.parse.mockImplementation(() => {
        throw new Error('Invalid cron expression');
      });

      const result = getNextRunDate('invalid-cron');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Error parsing cron expression: invalid-cron',
        expect.any(Error)
      );
    });

    it('should use UTC timezone for consistency', () => {
      const mockExpression = {
        next: jest.fn().mockReturnValue({
          toDate: jest.fn().mockReturnValue(new Date()),
        }),
      };

      const { CronExpressionParser } = jest.requireMock('cron-parser') as { CronExpressionParser: { parse: jest.Mock } };
      CronExpressionParser.parse.mockReturnValue(mockExpression);

      getNextRunDate('0 9 * * *');

      expect(CronExpressionParser.parse).toHaveBeenCalledWith(
        '0 9 * * *',
        expect.objectContaining({
          tz: 'UTC',
        })
      );
    });
  });

  describe('formatNextRunDate', () => {
    beforeEach(() => {
      // Mock toLocaleString to have consistent output across different environments
      jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(() => 'Jan 1, 2024, 12:00 PM');
    });

    afterEach(() => {
      (Date.prototype.toLocaleString as jest.Mock).mockRestore();
    });

    it('should return "No date" for null input', () => {
      const result = formatNextRunDate(null);
      expect(result).toBe('No date');
    });

    it('should format valid date correctly', () => {
      const date = new Date('2024-01-01T12:00:00Z');
      const result = formatNextRunDate(date);

      expect(result).toBe('Jan 1, 2024, 12:00 PM');
      expect(date.toLocaleString).toHaveBeenCalledWith('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    });

    it('should use correct locale formatting options', () => {
      const date = new Date('2024-01-01T12:00:00Z');
      formatNextRunDate(date);

      expect(date.toLocaleString).toHaveBeenCalledWith('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    });
  });

  describe('integration tests', () => {
    it('should work together for a complete workflow', () => {
      const mockDate = new Date('2024-01-01T12:00:00Z');
      const mockExpression = {
        next: jest.fn().mockReturnValue({
          toDate: jest.fn().mockReturnValue(mockDate),
        }),
      };

      const { CronExpressionParser } = jest.requireMock('cron-parser') as { CronExpressionParser: { parse: jest.Mock } };
      CronExpressionParser.parse.mockReturnValue(mockExpression);

      // Mock toLocaleString for consistent output
      jest.spyOn(mockDate, 'toLocaleString').mockReturnValue('Jan 1, 2024, 12:00 PM');

      const nextRunDate = getNextRunDate('0 9 * * *');
      const formattedDate = formatNextRunDate(nextRunDate);

      expect(nextRunDate).toBe(mockDate);
      expect(formattedDate).toBe('Jan 1, 2024, 12:00 PM');
    });

    it('should handle complete error workflow', () => {
      const { CronExpressionParser } = jest.requireMock('cron-parser') as { CronExpressionParser: { parse: jest.Mock } };
      CronExpressionParser.parse.mockImplementation(() => {
        throw new Error('Invalid cron expression');
      });

      const nextRunDate = getNextRunDate('invalid');
      const formattedDate = formatNextRunDate(nextRunDate);

      expect(nextRunDate).toBeNull();
      expect(formattedDate).toBe('No date');
    });
  });
});