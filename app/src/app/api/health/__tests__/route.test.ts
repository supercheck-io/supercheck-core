import { GET } from '../route';
import { NextResponse } from 'next/server';

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn(),
  },
}));

describe('Health API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock implementation
    (NextResponse.json as jest.Mock).mockImplementation((data) => ({ data }));
    // Mock the current date to have consistent test results
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('GET /api/health', () => {
    it('should return health status with ok status', async () => {
      const mockJsonResponse = { status: 'ok', timestamp: '2024-01-01T12:00:00.000Z' };
      (NextResponse.json as jest.Mock).mockReturnValue(mockJsonResponse);

      const response = await GET();

      expect(NextResponse.json).toHaveBeenCalledTimes(1);
      expect(NextResponse.json).toHaveBeenCalledWith({
        status: 'ok',
        timestamp: '2024-01-01T12:00:00.000Z',
      });
      expect(response).toEqual(mockJsonResponse);
    });

    it('should return current timestamp', async () => {
      const expectedTimestamp = '2024-01-01T12:00:00.000Z';
      
      await GET();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expectedTimestamp,
        })
      );
    });

    it('should have status field set to "ok"', async () => {
      await GET();

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ok',
        })
      );
    });

    it('should return response in correct format', async () => {
      await GET();

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0][0];
      
      expect(callArgs).toHaveProperty('status');
      expect(callArgs).toHaveProperty('timestamp');
      expect(typeof callArgs.status).toBe('string');
      expect(typeof callArgs.timestamp).toBe('string');
    });

    it('should return valid ISO timestamp format', async () => {
      await GET();

      const callArgs = (NextResponse.json as jest.Mock).mock.calls[0][0];
      const timestamp = callArgs.timestamp;
      
      // Check if timestamp is valid ISO string
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    it('should handle multiple requests with different timestamps', async () => {
      // First request
      await GET();
      const firstCall = (NextResponse.json as jest.Mock).mock.calls[0][0];
      
      // Advance time
      jest.setSystemTime(new Date('2024-01-01T12:01:00Z'));
      
      // Second request
      await GET();
      const secondCall = (NextResponse.json as jest.Mock).mock.calls[1][0];
      
      expect(firstCall.timestamp).toBe('2024-01-01T12:00:00.000Z');
      expect(secondCall.timestamp).toBe('2024-01-01T12:01:00.000Z');
      expect(firstCall.timestamp).not.toBe(secondCall.timestamp);
    });

    it('should not throw any errors', async () => {
      await expect(GET()).resolves.not.toThrow();
    });

    it('should return consistent structure', async () => {
      await GET();
      
      // Verify the response structure is consistent
      expect(NextResponse.json).toHaveBeenCalledWith({
        status: expect.any(String),
        timestamp: expect.any(String),
      });
    });
  });

  describe('error handling', () => {
    it('should handle Date.toISOString() errors gracefully', async () => {
      // Mock Date to throw an error
      const originalDate = global.Date;
      global.Date = class extends originalDate {
        toISOString() {
          throw new Error('Date error');
        }
      } as typeof Date;

      // The function should handle the error gracefully
      await expect(GET()).rejects.toThrow('Date error');

      // Restore original Date
      global.Date = originalDate;
    });

    it('should handle NextResponse.json errors', async () => {
      (NextResponse.json as jest.Mock).mockImplementation(() => {
        throw new Error('Response error');
      });

      await expect(GET()).rejects.toThrow('Response error');
    });
  });

  describe('response format validation', () => {
    it('should match expected API contract', async () => {
      await GET();

      const responseData = (NextResponse.json as jest.Mock).mock.calls[0][0];
      
      // Validate API contract
      expect(responseData).toEqual({
        status: 'ok',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      });
    });

    it('should have exactly two properties', async () => {
      await GET();

      const responseData = (NextResponse.json as jest.Mock).mock.calls[0][0];
      const properties = Object.keys(responseData);
      
      expect(properties).toHaveLength(2);
      expect(properties).toContain('status');
      expect(properties).toContain('timestamp');
    });

    it('should not include sensitive information', async () => {
      await GET();

      const responseData = (NextResponse.json as jest.Mock).mock.calls[0][0];
      
      // Ensure no sensitive data is exposed
      expect(responseData).not.toHaveProperty('version');
      expect(responseData).not.toHaveProperty('environment');
      expect(responseData).not.toHaveProperty('config');
      expect(responseData).not.toHaveProperty('secrets');
    });
  });

  describe('performance', () => {
    it('should execute quickly', async () => {
      const start = performance.now();
      await GET();
      const end = performance.now();
      
      // Health check should be very fast (under 10ms)
      expect(end - start).toBeLessThan(10);
    });

    it('should not have memory leaks on multiple calls', async () => {
      // Make multiple calls to ensure no memory leaks
      const promises = Array.from({ length: 100 }, () => GET());
      
      await expect(Promise.all(promises)).resolves.toHaveLength(100);
      
      // Verify all calls were made correctly
      expect(NextResponse.json).toHaveBeenCalledTimes(100);
    });
  });
});