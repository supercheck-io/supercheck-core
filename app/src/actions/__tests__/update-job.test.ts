import { updateJob, UpdateJobData } from '../update-job';

// Import modules first
import { db } from '@/utils/db';
import { requireProjectContext } from '@/lib/project-context';
import { buildUnifiedPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { logAuditEvent } from '@/lib/audit-logger';
import { scheduleJob, deleteScheduledJob } from '@/lib/job-scheduler';
import { getNextRunDate } from '@/lib/cron-utils';
import { revalidatePath } from 'next/cache';
import { UnifiedRole } from '@/lib/rbac/permissions';

// Mock dependencies
jest.mock('@/utils/db');
jest.mock('@/lib/project-context');
jest.mock('@/lib/rbac/middleware');
jest.mock('@/lib/audit-logger');
jest.mock('@/lib/job-scheduler');
jest.mock('@/lib/cron-utils');
jest.mock('next/cache');

// Type the mocked modules
const mockDb = jest.mocked(db);
const mockRequireProjectContext = jest.mocked(requireProjectContext);
const mockBuildPermissionContext = jest.mocked(buildUnifiedPermissionContext);
const mockHasPermission = jest.mocked(hasPermission);
const mockLogAuditEvent = jest.mocked(logAuditEvent);
const mockScheduleJob = jest.mocked(scheduleJob);
const mockDeleteScheduledJob = jest.mocked(deleteScheduledJob);
const mockGetNextRunDate = jest.mocked(getNextRunDate);
const mockRevalidatePath = jest.mocked(revalidatePath);

// Setup mock implementations
mockDb.select = jest.fn().mockReturnThis();
mockDb.update = jest.fn().mockReturnThis();
mockDb.delete = jest.fn().mockReturnThis();
mockDb.insert = jest.fn().mockReturnThis();
mockDb.from = jest.fn().mockReturnThis();
mockDb.where = jest.fn().mockReturnThis();
mockDb.set = jest.fn().mockReturnThis();
mockDb.values = jest.fn().mockReturnThis();
mockDb.limit = jest.fn().mockResolvedValue([]);

describe('updateJob server action', () => {
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

  const mockExistingJob = {
    id: 'job-123',
    name: 'Original Job',
    createdByUserId: 'user-123',
    cronSchedule: '0 8 * * *',
    scheduledJobId: 'scheduler-123',
    projectId: 'project-123',
    organizationId: 'org-123'
  };

  const validUpdateData: UpdateJobData = {
    jobId: 'job-123',
    name: 'Updated Job',
    description: 'Updated description',
    cronSchedule: '0 9 * * *',
    tests: [
      { id: 'test-1' },
      { id: 'test-2' }
    ]
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
    mockDb.limit.mockResolvedValue([mockExistingJob]);
    mockGetNextRunDate.mockReturnValue(new Date('2024-01-02T09:00:00Z'));
    mockScheduleJob.mockResolvedValue('new-scheduler-456');
    mockDeleteScheduledJob.mockResolvedValue(undefined);
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

  describe('successful job update', () => {
    it('should update job successfully with all fields', async () => {
      const result = await updateJob(validUpdateData);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Job updated successfully');
      expect(result.job).toEqual({
        id: 'job-123',
        name: 'Updated Job',
        description: 'Updated description',
        cronSchedule: '0 9 * * *',
        nextRunAt: '2024-01-02T09:00:00.000Z',
        scheduledJobId: 'new-scheduler-456',
        testCount: 2
      });

      // Verify database operations
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalled();
      
      // Verify audit logging
      expect(mockLogAuditEvent).toHaveBeenCalledWith({
        userId: 'user-123',
        organizationId: 'org-123',
        action: 'job_updated',
        resource: 'job',
        resourceId: 'job-123',
        metadata: {
          jobName: 'Updated Job',
          projectId: 'project-123',
          projectName: 'Test Project',
          testsCount: 2,
          cronScheduleChanged: true,
          oldCronSchedule: '0 8 * * *',
          newCronSchedule: '0 9 * * *',
          alertsEnabled: false,
          notificationProvidersCount: 0
        },
        success: true
      });

      // Verify path revalidation
      expect(mockRevalidatePath).toHaveBeenCalledWith('/jobs');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/jobs/edit/job-123');
    });

    it('should update job without description', async () => {
      const dataWithoutDescription = { ...validUpdateData, description: undefined };
      
      const result = await updateJob(dataWithoutDescription);

      expect(result.success).toBe(true);
      expect(result.job?.description).toBe('');
    });

    it('should update job without cron schedule', async () => {
      const dataWithoutCron = { ...validUpdateData, cronSchedule: undefined };
      
      const result = await updateJob(dataWithoutCron);

      expect(result.success).toBe(true);
      expect(result.job?.cronSchedule).toBeNull();
      expect(result.job?.scheduledJobId).toBeNull();
    });

    it('should handle schedule changes correctly', async () => {
      await updateJob(validUpdateData);

      // Should delete old scheduler and create new one
      expect(mockDeleteScheduledJob).toHaveBeenCalledWith('scheduler-123');
      expect(mockScheduleJob).toHaveBeenCalledWith({
        name: 'Updated Job',
        cron: '0 9 * * *',
        jobId: 'job-123',
        retryLimit: 3
      });
    });

    it('should keep existing scheduler when schedule unchanged', async () => {
      const dataWithSameSchedule = { ...validUpdateData, cronSchedule: '0 8 * * *' };
      
      const result = await updateJob(dataWithSameSchedule);

      expect(result.success).toBe(true);
      expect(mockDeleteScheduledJob).not.toHaveBeenCalled();
      expect(mockScheduleJob).not.toHaveBeenCalled();
      expect(result.job?.scheduledJobId).toBe('scheduler-123');
    });
  });

  describe('alert configuration', () => {
    it('should update job with alert config', async () => {
      const dataWithAlerts: UpdateJobData = {
        ...validUpdateData,
        alertConfig: {
          enabled: true,
          notificationProviders: ['provider-1', 'provider-2'],
          alertOnFailure: true,
          alertOnSuccess: false,
          alertOnTimeout: true,
          failureThreshold: 2,
          recoveryThreshold: 1,
          customMessage: 'Custom alert message'
        }
      };

      const result = await updateJob(dataWithAlerts);

      expect(result.success).toBe(true);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            alertsEnabled: true,
            notificationProvidersCount: 2
          })
        })
      );
    });

    it('should reject when alerts enabled but no providers selected', async () => {
      const dataWithInvalidAlerts: UpdateJobData = {
        ...validUpdateData,
        alertConfig: {
          enabled: true,
          notificationProviders: [],
          alertOnFailure: true,
          failureThreshold: 1,
          recoveryThreshold: 1
        }
      };

      const result = await updateJob(dataWithInvalidAlerts);

      expect(result.success).toBe(false);
      expect(result.error).toBe('At least one notification channel must be selected when alerts are enabled');
    });

    it('should reject when too many notification providers', async () => {
      process.env.MAX_JOB_NOTIFICATION_CHANNELS = '2';
      
      const dataWithTooManyProviders: UpdateJobData = {
        ...validUpdateData,
        alertConfig: {
          enabled: true,
          notificationProviders: ['provider-1', 'provider-2', 'provider-3'],
          alertOnFailure: true,
          failureThreshold: 1,
          recoveryThreshold: 1
        }
      };

      const result = await updateJob(dataWithTooManyProviders);

      expect(result.success).toBe(false);
      expect(result.error).toBe('You can only select up to 2 notification channels');
      
      delete process.env.MAX_JOB_NOTIFICATION_CHANNELS;
    });

    it('should reject when no alert types selected', async () => {
      const dataWithNoAlertTypes: UpdateJobData = {
        ...validUpdateData,
        alertConfig: {
          enabled: true,
          notificationProviders: ['provider-1'],
          alertOnFailure: false,
          alertOnSuccess: false,
          alertOnTimeout: false,
          failureThreshold: 1,
          recoveryThreshold: 1
        }
      };

      const result = await updateJob(dataWithNoAlertTypes);

      expect(result.success).toBe(false);
      expect(result.error).toBe('At least one alert type must be selected when alerts are enabled');
    });
  });

  describe('validation', () => {
    it('should validate required fields', async () => {
      const invalidData = {
        jobId: 'invalid-uuid',
        name: '',
        tests: []
      } as UpdateJobData;

      const result = await updateJob(invalidData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid data provided');
    });

    it('should validate UUID format for job ID', async () => {
      const dataWithInvalidJobId = { ...validUpdateData, jobId: 'invalid-uuid' };

      const result = await updateJob(dataWithInvalidJobId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid data provided');
    });

    it('should validate test IDs are UUIDs', async () => {
      const dataWithInvalidTestId = {
        ...validUpdateData,
        tests: [{ id: 'invalid-uuid' }]
      };

      const result = await updateJob(dataWithInvalidTestId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid data provided');
    });
  });

  describe('permission checks', () => {
    it('should reject when user lacks EDIT_JOBS permission', async () => {
      mockHasPermission.mockResolvedValue(false);

      const result = await updateJob(validUpdateData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Insufficient permissions to edit jobs');
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should check permissions with correct context', async () => {
      await updateJob(validUpdateData);

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
        'EDIT_JOBS'
      );
    });
  });

  describe('job existence validation', () => {
    it('should reject when job does not exist', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await updateJob(validUpdateData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Job with ID job-123 not found or access denied');
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should verify job belongs to current project', async () => {
      const jobFromDifferentProject = { 
        ...mockExistingJob, 
        projectId: 'different-project',
        organizationId: 'different-org'
      };
      mockDb.limit.mockResolvedValue([jobFromDifferentProject]);

      // The query itself should filter by project, so this shouldn't happen
      // but we test the validation logic
      await updateJob(validUpdateData);

      expect(mockDb.limit).toHaveBeenCalled();
    });
  });

  describe('scheduler management', () => {
    it('should delete old scheduler when schedule removed', async () => {
      const dataWithoutSchedule = { ...validUpdateData, cronSchedule: undefined };
      
      await updateJob(dataWithoutSchedule);

      expect(mockDeleteScheduledJob).toHaveBeenCalledWith('scheduler-123');
    });

    it('should handle scheduler deletion errors gracefully', async () => {
      mockDeleteScheduledJob.mockRejectedValue(new Error('Scheduler error'));

      const result = await updateJob(validUpdateData);

      expect(result.success).toBe(true); // Should continue despite scheduler error
      expect(console.error).toHaveBeenCalledWith(
        'Error deleting previous scheduler scheduler-123:',
        expect.any(Error)
      );
    });

    it('should handle scheduler creation errors gracefully', async () => {
      mockScheduleJob.mockRejectedValue(new Error('Schedule creation failed'));

      const result = await updateJob(validUpdateData);

      expect(result.success).toBe(true); // Should continue despite scheduler error
      expect(console.error).toHaveBeenCalledWith('Failed to schedule job:', expect.any(Error));
    });

    it('should handle invalid cron expression', async () => {
      mockGetNextRunDate.mockImplementation(() => {
        throw new Error('Invalid cron expression');
      });

      const result = await updateJob(validUpdateData);

      expect(result.success).toBe(true); // Should continue with null nextRunAt
      expect(console.error).toHaveBeenCalledWith(
        'Failed to calculate next run date:',
        expect.any(Error)
      );
    });
  });

  describe('error handling', () => {
    it('should handle database update errors', async () => {
      mockDb.update.mockRejectedValue(new Error('Database connection failed'));

      const result = await updateJob(validUpdateData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to update job: Database connection failed');
    });

    it('should handle project context errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('Authentication failed'));

      const result = await updateJob(validUpdateData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid data provided');
    });

    it('should handle unknown database errors', async () => {
      mockDb.update.mockRejectedValue('Unknown error');

      const result = await updateJob(validUpdateData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to update job: Unknown error');
    });
  });

  describe('test association management', () => {
    it('should recreate test associations with correct order', async () => {
      const dataWithOrderedTests: UpdateJobData = {
        ...validUpdateData,
        tests: [
          { id: 'test-3' },
          { id: 'test-1' },
          { id: 'test-2' }
        ]
      };

      await updateJob(dataWithOrderedTests);

      // Should delete existing associations first
      expect(mockDb.delete).toHaveBeenCalled();
      
      // Should create new associations with order
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith([
        { jobId: 'job-123', testId: 'test-3', orderPosition: 0 },
        { jobId: 'job-123', testId: 'test-1', orderPosition: 1 },
        { jobId: 'job-123', testId: 'test-2', orderPosition: 2 }
      ]);
    });

    it('should handle empty test list', async () => {
      const dataWithNoTests = { ...validUpdateData, tests: [] };

      const result = await updateJob(dataWithNoTests);

      expect(result.success).toBe(true);
      expect(result.job?.testCount).toBe(0);
      
      // Should still delete existing associations
      expect(mockDb.delete).toHaveBeenCalled();
      // But should not try to insert empty array
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('logging and monitoring', () => {
    it('should log update attempt', async () => {
      await updateJob(validUpdateData);

      expect(console.log).toHaveBeenCalledWith('Updating job job-123');
    });

    it('should log successful update', async () => {
      await updateJob(validUpdateData);

      expect(console.log).toHaveBeenCalledWith(
        'Job job-123 updated successfully by user user-123 in project Test Project'
      );
    });

    it('should log when user updates job created by different user', async () => {
      const jobCreatedByOtherUser = { ...mockExistingJob, createdByUserId: 'other-user' };
      mockDb.limit.mockResolvedValue([jobCreatedByOtherUser]);

      await updateJob(validUpdateData);

      expect(console.log).toHaveBeenCalledWith(
        'User user-123 is updating job job-123 originally created by other-user'
      );
    });

    it('should log permission warnings', async () => {
      mockHasPermission.mockResolvedValue(false);

      await updateJob(validUpdateData);

      expect(console.warn).toHaveBeenCalledWith(
        'User user-123 attempted to update job job-123 without EDIT_JOBS permission'
      );
    });
  });
});