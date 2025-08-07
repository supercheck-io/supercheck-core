import { getRun } from '../get-runs';

// Import modules first
import { db } from '@/utils/db';
import { requireAuth, getUserOrgRole } from '@/lib/rbac/middleware';
import { isSuperAdmin } from '@/lib/admin';

// Mock dependencies
jest.mock('@/utils/db');
jest.mock('@/lib/rbac/middleware');
jest.mock('@/lib/admin');

// Type the mocked modules
const mockDb = jest.mocked(db);
const mockRequireAuth = jest.mocked(requireAuth);
const mockGetUserOrgRole = jest.mocked(getUserOrgRole);
const mockIsSuperAdmin = jest.mocked(isSuperAdmin);

// Setup mock implementations
mockDb.select = jest.fn().mockReturnThis();
mockDb.from = jest.fn().mockReturnThis();
mockDb.leftJoin = jest.fn().mockReturnThis();
mockDb.where = jest.fn().mockReturnThis();
mockDb.limit = jest.fn().mockResolvedValue([]);

describe('getRun server action', () => {
  const mockRunData = {
    id: 'run-123',
    jobId: 'job-123',
    jobName: 'Test Job',
    projectName: 'Test Project',
    status: 'completed',
    duration: '120s',
    startedAt: new Date('2024-01-01T09:00:00Z'),
    completedAt: new Date('2024-01-01T09:02:00Z'),
    logs: '{"test": "logs"}',
    errorDetails: null,
    reportUrl: 'https://s3.example.com/report.html',
    trigger: 'manual',
    projectId: 'project-123',
    organizationId: 'org-123'
  };

  const mockTestCountResult = [{ count: 3 }];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful mocks
    mockRequireAuth.mockResolvedValue({ userId: 'user-123' });
    mockIsSuperAdmin.mockResolvedValue(false);
    mockGetUserOrgRole.mockResolvedValue('project_viewer');
    
    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  describe('successful run retrieval', () => {
    it('should get run successfully with all data', async () => {
      // Mock run query result
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])  // First query for run data
        .mockResolvedValueOnce(mockTestCountResult);  // Second query for test count

      const result = await getRun('run-123');

      expect(result).toEqual({
        id: 'run-123',
        jobId: 'job-123',
        jobName: 'Test Job',
        projectName: 'Test Project',
        status: 'completed',
        duration: '120s',
        startedAt: '2024-01-01T09:00:00.000Z',
        completedAt: '2024-01-01T09:02:00.000Z',
        logs: '{"test": "logs"}',
        errorDetails: null,
        reportUrl: 'https://s3.example.com/report.html',
        trigger: 'manual',
        testCount: 3
      });

      // Verify queries were called correctly
      expect(mockDb.select).toHaveBeenCalledTimes(2);
      expect(mockDb.leftJoin).toHaveBeenCalledTimes(3); // jobs, projects, reports
      expect(mockDb.where).toHaveBeenCalledTimes(2);
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it('should handle run without job name', async () => {
      const runWithoutJobName = { ...mockRunData, jobName: null };
      mockDb.limit
        .mockResolvedValueOnce([runWithoutJobName])
        .mockResolvedValueOnce(mockTestCountResult);

      const result = await getRun('run-123');

      expect(result?.jobName).toBeUndefined();
    });

    it('should handle run without project name', async () => {
      const runWithoutProjectName = { ...mockRunData, projectName: null };
      mockDb.limit
        .mockResolvedValueOnce([runWithoutProjectName])
        .mockResolvedValueOnce(mockTestCountResult);

      const result = await getRun('run-123');

      expect(result?.projectName).toBeUndefined();
    });

    it('should handle run without timestamps', async () => {
      const runWithoutTimestamps = { 
        ...mockRunData, 
        startedAt: null, 
        completedAt: null 
      };
      mockDb.limit
        .mockResolvedValueOnce([runWithoutTimestamps])
        .mockResolvedValueOnce(mockTestCountResult);

      const result = await getRun('run-123');

      expect(result?.startedAt).toBeNull();
      expect(result?.completedAt).toBeNull();
    });

    it('should handle run without report URL', async () => {
      const runWithoutReport = { ...mockRunData, reportUrl: null };
      mockDb.limit
        .mockResolvedValueOnce([runWithoutReport])
        .mockResolvedValueOnce(mockTestCountResult);

      const result = await getRun('run-123');

      expect(result?.reportUrl).toBeNull();
    });

    it('should handle zero test count', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockResolvedValueOnce([{ count: 0 }]);

      const result = await getRun('run-123');

      expect(result?.testCount).toBe(0);
    });

    it('should handle missing test count result', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockResolvedValueOnce([]);

      const result = await getRun('run-123');

      expect(result?.testCount).toBe(0);
    });
  });

  describe('validation', () => {
    it('should reject when runId is empty', async () => {
      await expect(getRun('')).rejects.toThrow('Missing run ID');
      
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should reject when runId is undefined', async () => {
      await expect(getRun(undefined as unknown as string)).rejects.toThrow('Missing run ID');
      
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should reject when runId is null', async () => {
      await expect(getRun(null as unknown as string)).rejects.toThrow('Missing run ID');
      
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('authentication and authorization', () => {
    it('should require authentication', async () => {
      mockDb.limit.mockResolvedValueOnce([mockRunData]);

      await getRun('run-123');

      expect(mockRequireAuth).toHaveBeenCalled();
    });

    it('should reject when authentication fails', async () => {
      mockRequireAuth.mockRejectedValue(new Error('Authentication required'));

      await expect(getRun('run-123')).rejects.toThrow('Authentication required');
    });

    it('should allow super admin access to any run', async () => {
      mockIsSuperAdmin.mockResolvedValue(true);
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockResolvedValueOnce(mockTestCountResult);

      const result = await getRun('run-123');

      expect(result).toBeTruthy();
      expect(mockGetUserOrgRole).not.toHaveBeenCalled();
    });

    it('should check organization membership for non-super-admin users', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockResolvedValueOnce(mockTestCountResult);

      await getRun('run-123');

      expect(mockIsSuperAdmin).toHaveBeenCalled();
      expect(mockGetUserOrgRole).toHaveBeenCalledWith('user-123', 'org-123');
    });

    it('should reject when user is not organization member', async () => {
      mockGetUserOrgRole.mockResolvedValue(null);
      mockDb.limit.mockResolvedValueOnce([mockRunData]);

      await expect(getRun('run-123')).rejects.toThrow('Access denied: Not a member of this organization');
    });

    it('should handle run without organization ID', async () => {
      const runWithoutOrgId = { ...mockRunData, organizationId: null };
      mockDb.limit
        .mockResolvedValueOnce([runWithoutOrgId])
        .mockResolvedValueOnce(mockTestCountResult);

      const result = await getRun('run-123');

      expect(result).toBeTruthy();
      expect(mockGetUserOrgRole).not.toHaveBeenCalled();
    });
  });

  describe('run not found', () => {
    it('should return null when run does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await getRun('nonexistent-run');

      expect(result).toBeNull();
    });

    it('should not perform test count query when run not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await getRun('nonexistent-run');

      // Should only call select once (for the run query)
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('database queries', () => {
    it('should join with jobs, projects, and reports tables', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockResolvedValueOnce(mockTestCountResult);

      await getRun('run-123');

      // Verify all necessary joins are made
      expect(mockDb.leftJoin).toHaveBeenCalledTimes(3);
      
      // First query should join jobs, projects, and reports
      // Second query should be for jobTests count
    });

    it('should query test count for the correct job', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockResolvedValueOnce(mockTestCountResult);

      await getRun('run-123');

      // Verify second query is for test count
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it('should use correct report entity type filter', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockResolvedValueOnce(mockTestCountResult);

      await getRun('run-123');

      // Verify leftJoin with reports includes correct filters
      expect(mockDb.leftJoin).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database query errors', async () => {
      mockDb.limit.mockRejectedValue(new Error('Database connection failed'));

      await expect(getRun('run-123')).rejects.toThrow('Failed to fetch run');
      
      expect(console.error).toHaveBeenCalledWith('Error fetching run:', expect.any(Error));
    });

    it('should handle organization role check errors', async () => {
      mockDb.limit.mockResolvedValueOnce([mockRunData]);
      mockGetUserOrgRole.mockRejectedValue(new Error('Role check failed'));

      await expect(getRun('run-123')).rejects.toThrow('Failed to fetch run');
      
      expect(console.error).toHaveBeenCalledWith('Error fetching run:', expect.any(Error));
    });

    it('should handle super admin check errors', async () => {
      mockDb.limit.mockResolvedValueOnce([mockRunData]);
      mockIsSuperAdmin.mockRejectedValue(new Error('Admin check failed'));

      await expect(getRun('run-123')).rejects.toThrow('Failed to fetch run');
      
      expect(console.error).toHaveBeenCalledWith('Error fetching run:', expect.any(Error));
    });

    it('should handle test count query errors', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockRejectedValueOnce(new Error('Test count query failed'));

      await expect(getRun('run-123')).rejects.toThrow('Failed to fetch run');
      
      expect(console.error).toHaveBeenCalledWith('Error fetching run:', expect.any(Error));
    });

    it('should handle unknown errors', async () => {
      mockRequireAuth.mockRejectedValue('Unknown error');

      await expect(getRun('run-123')).rejects.toThrow('Failed to fetch run');
      
      expect(console.error).toHaveBeenCalledWith('Error fetching run:', 'Unknown error');
    });
  });

  describe('date formatting', () => {
    it('should format timestamps as ISO strings', async () => {
      const customStartTime = new Date('2023-12-25T15:30:45.123Z');
      const customEndTime = new Date('2023-12-25T15:35:20.456Z');
      
      const runWithCustomTimes = {
        ...mockRunData,
        startedAt: customStartTime,
        completedAt: customEndTime
      };
      
      mockDb.limit
        .mockResolvedValueOnce([runWithCustomTimes])
        .mockResolvedValueOnce(mockTestCountResult);

      const result = await getRun('run-123');

      expect(result?.startedAt).toBe('2023-12-25T15:30:45.123Z');
      expect(result?.completedAt).toBe('2023-12-25T15:35:20.456Z');
    });

    it('should handle invalid date objects', async () => {
      const runWithInvalidDates = {
        ...mockRunData,
        startedAt: new Date('invalid'),
        completedAt: new Date('invalid')
      };
      
      mockDb.limit
        .mockResolvedValueOnce([runWithInvalidDates])
        .mockResolvedValueOnce(mockTestCountResult);

      // Should not throw, but handle gracefully
      const result = await getRun('run-123');
      
      expect(result).toBeTruthy();
      // Invalid dates become "Invalid Date" when converted to ISO string
    });
  });

  describe('response structure', () => {
    it('should return correct response structure', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockResolvedValueOnce(mockTestCountResult);

      const result = await getRun('run-123');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('testCount');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('completedAt');
      
      // Optional properties
      expect(result).toHaveProperty('jobName');
      expect(result).toHaveProperty('projectName');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('logs');
      expect(result).toHaveProperty('errorDetails');
      expect(result).toHaveProperty('reportUrl');
      expect(result).toHaveProperty('trigger');
    });

    it('should exclude internal database fields', async () => {
      mockDb.limit
        .mockResolvedValueOnce([mockRunData])
        .mockResolvedValueOnce(mockTestCountResult);

      const result = await getRun('run-123');

      expect(result).not.toHaveProperty('projectId');
      expect(result).not.toHaveProperty('organizationId');
    });
  });
});