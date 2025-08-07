import { scheduleCronJob, cancelScheduledJob } from '../schedule-job';

// Import modules first
import { db } from '@/utils/db';
import { requireProjectContext } from '@/lib/project-context';
import { scheduleJob, deleteScheduledJob } from '@/lib/job-scheduler';
import { UnifiedRole } from '@/lib/rbac/permissions';

// Mock dependencies
jest.mock('@/utils/db');
jest.mock('@/lib/project-context');
jest.mock('@/lib/job-scheduler');

// Type the mocked modules
const mockDb = jest.mocked(db);
const mockRequireProjectContext = jest.mocked(requireProjectContext);
const mockScheduleJob = jest.mocked(scheduleJob);
const mockDeleteScheduledJob = jest.mocked(deleteScheduledJob);

// Setup mock implementations
mockDb.select = jest.fn().mockReturnThis();
mockDb.update = jest.fn().mockReturnThis();
mockDb.from = jest.fn().mockReturnThis();
mockDb.where = jest.fn().mockReturnThis();
mockDb.set = jest.fn().mockReturnThis();
mockDb.limit = jest.fn().mockResolvedValue([]);

describe('schedule-job server actions', () => {
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

  const mockJob = {
    id: 'job-123',
    name: 'Test Job',
    description: 'A test job',
    cronSchedule: '0 9 * * *',
    status: 'pending',
    projectId: 'project-123',
    organizationId: 'org-123',
    scheduledJobId: 'scheduled-123',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    createdByUserId: 'user-123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful mocks
    mockRequireProjectContext.mockResolvedValue(mockProjectContext);
    mockScheduleJob.mockResolvedValue('new-scheduled-456');
    mockDeleteScheduledJob.mockResolvedValue(true);
    
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

  describe('scheduleCronJob', () => {
    describe('successful scheduling', () => {
      it('should schedule job successfully', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);

        const result = await scheduleCronJob('job-123', '0 10 * * *');

        expect(result.success).toBe(true);
        expect(result.scheduleName).toBe('new-scheduled-456');
        
        // Verify job scheduler was called with correct parameters
        expect(mockScheduleJob).toHaveBeenCalledWith({
          name: 'Test Job',
          cron: '0 10 * * *',
          timezone: 'UTC',
          jobId: 'job-123',
          retryLimit: 1
        });

        // Verify database update
        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.set).toHaveBeenCalledWith({
          scheduledJobId: 'new-scheduled-456',
          updatedAt: expect.any(Date)
        });
      });

      it('should use UTC timezone by default', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);

        await scheduleCronJob('job-123', '0 10 * * *');

        expect(mockScheduleJob).toHaveBeenCalledWith(
          expect.objectContaining({
            timezone: 'UTC'
          })
        );
      });

      it('should set retry limit to 1', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);

        await scheduleCronJob('job-123', '0 10 * * *');

        expect(mockScheduleJob).toHaveBeenCalledWith(
          expect.objectContaining({
            retryLimit: 1
          })
        );
      });
    });

    describe('validation', () => {
      it('should reject when cron expression is empty', async () => {
        const result = await scheduleCronJob('job-123', '');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Cron expression is required');
        expect(mockScheduleJob).not.toHaveBeenCalled();
      });

      it('should reject when cron expression is undefined', async () => {
        const result = await scheduleCronJob('job-123', undefined as unknown as string);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Cron expression is required');
        expect(mockScheduleJob).not.toHaveBeenCalled();
      });

      it('should reject when job does not exist', async () => {
        mockDb.limit.mockResolvedValue([]);

        const result = await scheduleCronJob('nonexistent-job', '0 10 * * *');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Job not found or access denied');
        expect(mockScheduleJob).not.toHaveBeenCalled();
      });

      it('should verify job belongs to current project', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);

        await scheduleCronJob('job-123', '0 10 * * *');

        // Verify query includes project and organization filters
        expect(mockDb.where).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle job scheduler errors', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);
        mockScheduleJob.mockRejectedValue(new Error('Scheduler unavailable'));

        const result = await scheduleCronJob('job-123', '0 10 * * *');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Scheduler unavailable');
      });

      it('should handle database update errors', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);
        mockDb.update.mockRejectedValue(new Error('Database connection failed'));

        const result = await scheduleCronJob('job-123', '0 10 * * *');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Database connection failed');
      });

      it('should handle project context errors', async () => {
        mockRequireProjectContext.mockRejectedValue(new Error('Authentication failed'));

        const result = await scheduleCronJob('job-123', '0 10 * * *');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Authentication failed');
      });

      it('should handle database query errors', async () => {
        mockDb.limit.mockRejectedValue(new Error('Query failed'));

        const result = await scheduleCronJob('job-123', '0 10 * * *');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Query failed');
      });

      it('should handle unknown errors', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);
        mockScheduleJob.mockRejectedValue('Unknown error');

        const result = await scheduleCronJob('job-123', '0 10 * * *');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to schedule job');
      });
    });

    describe('logging', () => {
      it('should log scheduler errors', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);
        mockScheduleJob.mockRejectedValue(new Error('Scheduler error'));

        await scheduleCronJob('job-123', '0 10 * * *');

        expect(console.error).toHaveBeenCalledWith('Error scheduling job:', expect.any(Error));
      });

      it('should log database query errors', async () => {
        mockDb.limit.mockRejectedValue(new Error('Query error'));

        await scheduleCronJob('job-123', '0 10 * * *');

        expect(console.error).toHaveBeenCalledWith('Error getting job:', expect.any(Error));
      });
    });
  });

  describe('cancelScheduledJob', () => {
    describe('successful cancellation', () => {
      it('should cancel scheduled job successfully', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);

        const result = await cancelScheduledJob('job-123');

        expect(result.success).toBe(true);
        
        // Verify scheduler deletion
        expect(mockDeleteScheduledJob).toHaveBeenCalledWith('scheduled-123');

        // Verify database update
        expect(mockDb.set).toHaveBeenCalledWith({
          scheduledJobId: null,
          updatedAt: expect.any(Date)
        });
      });

      it('should handle job with no scheduledJobId', async () => {
        const jobWithoutSchedule = { ...mockJob, scheduledJobId: null };
        mockDb.limit.mockResolvedValue([jobWithoutSchedule]);

        const result = await cancelScheduledJob('job-123');

        expect(result.success).toBe(true);
        expect(result.error).toBe('Job is not scheduled');
        expect(mockDeleteScheduledJob).not.toHaveBeenCalled();
        
        expect(console.log).toHaveBeenCalledWith('Job job-123 has no scheduled job to cancel');
      });

      it('should handle job not found gracefully', async () => {
        mockDb.limit.mockResolvedValue([]);

        const result = await cancelScheduledJob('nonexistent-job');

        expect(result.success).toBe(true);
        expect(result.error).toBe('Job not found or access denied');
        expect(mockDeleteScheduledJob).not.toHaveBeenCalled();
        
        expect(console.warn).toHaveBeenCalledWith(
          'Cannot cancel schedule for job nonexistent-job: Job not found or access denied'
        );
      });
    });

    describe('error handling', () => {
      it('should handle scheduler deletion errors gracefully', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);
        mockDeleteScheduledJob.mockRejectedValue(new Error('Scheduler deletion failed'));

        const result = await cancelScheduledJob('job-123');

        expect(result.success).toBe(true); // Should continue despite scheduler error
        
        // Should still update database
        expect(mockDb.set).toHaveBeenCalledWith({
          scheduledJobId: null,
          updatedAt: expect.any(Date)
        });

        expect(console.error).toHaveBeenCalledWith(
          'Error deleting scheduled job:',
          expect.any(Error)
        );
      });

      it('should handle scheduler deletion returning false', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);
        mockDeleteScheduledJob.mockResolvedValue(false);

        const result = await cancelScheduledJob('job-123');

        expect(result.success).toBe(true);
        
        expect(console.warn).toHaveBeenCalledWith('Failed to delete scheduled job scheduled-123');
      });

      it('should handle database update errors gracefully', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);
        mockDb.update.mockRejectedValue(new Error('Database update failed'));

        const result = await cancelScheduledJob('job-123');

        expect(result.success).toBe(true); // Should still return success
        
        expect(console.error).toHaveBeenCalledWith(
          'Error updating job in database:',
          expect.any(Error)
        );
      });

      it('should handle project context errors gracefully', async () => {
        mockRequireProjectContext.mockRejectedValue(new Error('Authentication failed'));

        const result = await cancelScheduledJob('job-123');

        expect(result.success).toBe(true); // Should return success to allow job deletion
        expect(result.error).toBe('Failed to cancel scheduled job, but job deletion can proceed');
        
        expect(console.error).toHaveBeenCalledWith(
          'Error canceling scheduled job:',
          expect.any(Error)
        );
      });

      it('should handle unknown errors gracefully', async () => {
        mockDb.limit.mockRejectedValue('Unknown error');

        const result = await cancelScheduledJob('job-123');

        expect(result.success).toBe(true); // Should return success to allow job deletion
        expect(result.error).toBe('Failed to cancel scheduled job, but job deletion can proceed');
      });
    });

    describe('project scoping', () => {
      it('should verify job belongs to current project', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);

        await cancelScheduledJob('job-123');

        // Verify query includes project and organization filters
        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should use project context for authorization', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);

        await cancelScheduledJob('job-123');

        expect(mockRequireProjectContext).toHaveBeenCalled();
      });
    });

    describe('graceful degradation', () => {
      it('should prioritize job deletion workflow continuation', async () => {
        // Multiple failures should still return success
        mockRequireProjectContext.mockRejectedValue(new Error('Auth failed'));
        mockDb.limit.mockRejectedValue(new Error('DB failed'));
        mockDeleteScheduledJob.mockRejectedValue(new Error('Scheduler failed'));

        const result = await cancelScheduledJob('job-123');

        expect(result.success).toBe(true);
        expect(result.error).toBe('Failed to cancel scheduled job, but job deletion can proceed');
      });

      it('should allow job deletion to proceed even with scheduler issues', async () => {
        mockDb.limit.mockResolvedValue([mockJob]);
        mockDeleteScheduledJob.mockRejectedValue(new Error('Critical scheduler error'));
        mockDb.update.mockRejectedValue(new Error('Critical DB error'));

        const result = await cancelScheduledJob('job-123');

        expect(result.success).toBe(true);
      });
    });
  });

  describe('getJob helper function', () => {
    it('should query with correct project scoping', async () => {
      mockDb.limit.mockResolvedValue([mockJob]);

      await scheduleCronJob('job-123', '0 10 * * *');

      // Verify the query structure includes project and organization filtering
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it('should handle query errors properly', async () => {
      mockDb.limit.mockRejectedValue(new Error('Database connection lost'));

      const result = await scheduleCronJob('job-123', '0 10 * * *');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection lost');
    });
  });
});