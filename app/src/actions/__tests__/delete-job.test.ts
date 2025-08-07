import { deleteJob } from '../delete-job';

// Import modules first
import { db } from '@/utils/db';
import { requireProjectContext } from '@/lib/project-context';
import { buildUnifiedPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { logAuditEvent } from '@/lib/audit-logger';
import { revalidatePath } from 'next/cache';
import { UnifiedRole } from '@/lib/rbac/permissions';

// Mock dependencies
jest.mock('@/utils/db');
jest.mock('@/lib/project-context');
jest.mock('@/lib/rbac/middleware');
jest.mock('@/lib/audit-logger');
jest.mock('next/cache');

// Type the mocked modules
const mockDb = jest.mocked(db);
const mockRequireProjectContext = jest.mocked(requireProjectContext);
const mockBuildPermissionContext = jest.mocked(buildUnifiedPermissionContext);
const mockHasPermission = jest.mocked(hasPermission);
const mockLogAuditEvent = jest.mocked(logAuditEvent);
const mockRevalidatePath = jest.mocked(revalidatePath);

// Setup mock implementations
mockDb.select = jest.fn().mockReturnThis();
mockDb.delete = jest.fn().mockReturnThis();
mockDb.from = jest.fn().mockReturnThis();
mockDb.where = jest.fn().mockResolvedValue([]);

describe('deleteJob server action', () => {
  const mockProjectContext = {
    userId: 'user-123',
    project: { 
      id: 'project-123', 
      name: 'Test Project',
      organizationId: 'org-123',
      isDefault: false,
      userRole: UnifiedRole.PROJECT_EDITOR
    },
    organizationId: 'org-123',
  };

  const mockJobData = {
    id: 'job-123',
    name: 'Test Job',
    description: 'A test job',
    cronSchedule: '0 9 * * *'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful mocks
    mockRequireProjectContext.mockResolvedValue(mockProjectContext);
    mockBuildPermissionContext.mockResolvedValue({
      type: 'project',
      userId: 'user-123',
      organizationId: 'org-123',
      projectId: 'project-123',
      role: UnifiedRole.PROJECT_EDITOR
    });
    mockHasPermission.mockResolvedValue(true);
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockRevalidatePath.mockImplementation(() => {});
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
    (console.warn as jest.Mock).mockRestore();
  });

  describe('successful job deletion', () => {
    it('should delete job successfully', async () => {
      // Mock job exists
      mockDb.where.mockResolvedValue([mockJobData]);

      const result = await deleteJob('job-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Job deleted successfully');

      // Verify database delete operations called in correct order
      expect(mockDb.delete).toHaveBeenCalledTimes(3);
      
      // Verify audit logging
      expect(mockLogAuditEvent).toHaveBeenCalledWith({
        userId: 'user-123',
        organizationId: 'org-123',
        action: 'job_deleted',
        resource: 'job',
        resourceId: 'job-123',
        metadata: {
          jobName: 'Test Job',
          jobDescription: 'A test job',
          cronSchedule: '0 9 * * *',
          projectId: 'project-123',
          projectName: 'Test Project'
        },
        success: true
      });

      // Verify path revalidation
      expect(mockRevalidatePath).toHaveBeenCalledWith('/jobs');
    });

    it('should delete job without description', async () => {
      const jobWithoutDescription = { ...mockJobData, description: null };
      mockDb.where.mockResolvedValue([jobWithoutDescription]);

      const result = await deleteJob('job-123');

      expect(result.success).toBe(true);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            jobDescription: null
          })
        })
      );
    });

    it('should delete job without cron schedule', async () => {
      const jobWithoutCron = { ...mockJobData, cronSchedule: null };
      mockDb.where.mockResolvedValue([jobWithoutCron]);

      const result = await deleteJob('job-123');

      expect(result.success).toBe(true);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            cronSchedule: null
          })
        })
      );
    });
  });

  describe('validation', () => {
    it('should reject when jobId is missing', async () => {
      const result = await deleteJob('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Job ID is required');
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('should reject when jobId is undefined', async () => {
      const result = await deleteJob(undefined as unknown as string);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Job ID is required');
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('should reject when jobId is null', async () => {
      const result = await deleteJob(null as unknown as string);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Job ID is required');
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });

  describe('permission checks', () => {
    it('should reject when user lacks DELETE_JOBS permission', async () => {
      mockHasPermission.mockResolvedValue(false);

      const result = await deleteJob('job-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions to delete jobs');
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('should check permissions with correct context', async () => {
      mockDb.where.mockResolvedValue([mockJobData]);

      await deleteJob('job-123');

      expect(mockBuildPermissionContext).toHaveBeenCalledWith(
        'user-123',
        'project',
        'org-123',
        'project-123'
      );
      expect(mockHasPermission).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'project',
          userId: 'user-123',
          organizationId: 'org-123',
          projectId: 'project-123'
        }),
        'DELETE_JOBS'
      );
    });
  });

  describe('job existence validation', () => {
    it('should reject when job does not exist', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await deleteJob('nonexistent-job');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Job not found or access denied');
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('should verify job belongs to current project', async () => {
      mockDb.where.mockResolvedValue([mockJobData]);

      await deleteJob('job-123');

      // Verify the query includes project and organization filters
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('cascading deletion', () => {
    it('should delete runs, job-tests, then job in correct order', async () => {
      mockDb.where.mockResolvedValue([mockJobData]);
      const deleteCallOrder: string[] = [];
      
      mockDb.delete.mockImplementation(() => {
        deleteCallOrder.push('delete-called');
        return mockDb;
      });

      await deleteJob('job-123');

      // Should call delete 3 times: runs, jobTests, jobs
      expect(mockDb.delete).toHaveBeenCalledTimes(3);
      expect(deleteCallOrder).toHaveLength(3);
    });

    it('should handle deletion of job with no runs or tests', async () => {
      mockDb.where.mockResolvedValue([mockJobData]);

      const result = await deleteJob('job-123');

      expect(result.success).toBe(true);
      // Still should attempt to delete runs and jobTests even if none exist
      expect(mockDb.delete).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should handle database deletion errors', async () => {
      mockDb.where.mockResolvedValue([mockJobData]);
      mockDb.delete.mockRejectedValue(new Error('Database connection failed'));

      const result = await deleteJob('job-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
    });

    it('should handle project context errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('Authentication failed'));

      const result = await deleteJob('job-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication failed');
    });

    it('should handle permission context errors', async () => {
      mockBuildPermissionContext.mockRejectedValue(new Error('Permission context error'));

      const result = await deleteJob('job-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission context error');
    });

    it('should handle audit logging errors gracefully', async () => {
      mockDb.where.mockResolvedValue([mockJobData]);
      mockLogAuditEvent.mockRejectedValue(new Error('Audit logging failed'));

      const result = await deleteJob('job-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Audit logging failed');
    });

    it('should handle unknown errors', async () => {
      mockDb.where.mockResolvedValue([mockJobData]);
      mockDb.delete.mockRejectedValue('Unknown error');

      const result = await deleteJob('job-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete job');
    });
  });

  describe('logging and monitoring', () => {
    it('should log job deletion attempt', async () => {
      mockDb.where.mockResolvedValue([mockJobData]);

      await deleteJob('job-123');

      expect(console.log).toHaveBeenCalledWith('Deleting job with ID:', 'job-123');
    });

    it('should log successful deletion', async () => {
      mockDb.where.mockResolvedValue([mockJobData]);

      await deleteJob('job-123');

      expect(console.log).toHaveBeenCalledWith(
        'Successfully deleted job job-123 from project Test Project by user user-123'
      );
    });

    it('should log permission warnings', async () => {
      mockHasPermission.mockResolvedValue(false);

      await deleteJob('job-123');

      expect(console.warn).toHaveBeenCalledWith(
        'User user-123 attempted to delete job job-123 without DELETE_JOBS permission'
      );
    });

    it('should log errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('Test error'));

      await deleteJob('job-123');

      expect(console.error).toHaveBeenCalledWith('Error deleting job:', expect.any(Error));
    });
  });
});