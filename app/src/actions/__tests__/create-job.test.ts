import { createJob, CreateJobData } from '../create-job';

// Import modules first
import { db } from '@/utils/db';
import { requireProjectContext } from '@/lib/project-context';
import { buildPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { logAuditEvent } from '@/lib/audit-logger';
import { scheduleJob } from '@/lib/job-scheduler';
import { getNextRunDate } from '@/lib/cron-utils';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { ProjectRole } from '@/lib/rbac/permissions';

// Mock dependencies
jest.mock('@/utils/db');
jest.mock('@/lib/project-context');
jest.mock('@/lib/rbac/middleware');
jest.mock('@/lib/audit-logger');
jest.mock('@/lib/job-scheduler');
jest.mock('@/lib/cron-utils');
jest.mock('next/cache');
jest.mock('crypto');

// Type the mocked modules
const mockDb = jest.mocked(db);
const mockRequireProjectContext = jest.mocked(requireProjectContext);
const mockBuildPermissionContext = jest.mocked(buildPermissionContext);
const mockHasPermission = jest.mocked(hasPermission);
const mockLogAuditEvent = jest.mocked(logAuditEvent);
const mockScheduleJob = jest.mocked(scheduleJob);
const mockGetNextRunDate = jest.mocked(getNextRunDate);
const mockRevalidatePath = jest.mocked(revalidatePath);
const mockCrypto = jest.mocked(crypto);

// Setup mock implementations
mockDb.insert = jest.fn().mockReturnThis();
mockDb.update = jest.fn().mockReturnThis();
mockDb.set = jest.fn().mockReturnThis();
mockDb.where = jest.fn().mockResolvedValue(undefined);

describe('createJob server action', () => {

  const mockProjectContext = {
    userId: 'user-123',
    project: { 
      id: 'project-123', 
      name: 'Test Project',
      organizationId: 'org-123',
      isDefault: false,
      userRole: ProjectRole.ADMIN
    },
    organizationId: 'org-123',
  };

  const validJobData: CreateJobData = {
    name: 'Test Job',
    description: 'A test job for unit testing',
    cronSchedule: '0 9 * * *',
    tests: [
      { id: 'test-1' },
      { id: 'test-2' },
    ],
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
      projectRole: ProjectRole.ADMIN
    });
    mockHasPermission.mockResolvedValue(true);
    mockCrypto.randomUUID.mockReturnValue('550e8400-e29b-41d4-a716-446655440000');
    mockGetNextRunDate.mockReturnValue(new Date('2024-01-02T09:00:00Z'));
    mockScheduleJob.mockResolvedValue('scheduled-job-456');
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

  describe('successful job creation', () => {
    it('should create job successfully with all fields', async () => {
      const result = await createJob(validJobData);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Job created successfully');
      expect(result.job).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Job',
        description: 'A test job for unit testing',
        cronSchedule: '0 9 * * *',
        nextRunAt: '2024-01-02T09:00:00.000Z',
        scheduledJobId: 'scheduled-job-456',
        testCount: 2,
        createdByUserId: 'user-123',
      });

      // Verify database calls
      expect(mockDb.insert).toHaveBeenCalledWith(expect.any(Object));
      expect(mockDb.insert).toHaveBeenCalledWith(expect.any(Object));
      
      // Verify job-test relationships were created
      expect(mockDb.insert).toHaveBeenCalledWith(expect.any(Object));
      
      // Verify audit logging
      expect(mockLogAuditEvent).toHaveBeenCalledWith({
        userId: 'user-123',
        organizationId: 'org-123',
        action: 'job_created',
        resource: 'job',
        resourceId: '550e8400-e29b-41d4-a716-446655440000',
        metadata: {
          jobName: 'Test Job',
          testCount: 2,
          cronSchedule: '0 9 * * *',
          projectId: 'project-123',
          projectName: 'Test Project'
        },
        success: true
      });

      // Verify path revalidation
      expect(mockRevalidatePath).toHaveBeenCalledWith('/jobs');
    });

    it('should create job without cron schedule', async () => {
      const jobDataWithoutCron = {
        ...validJobData,
        cronSchedule: undefined,
      };

      const result = await createJob(jobDataWithoutCron);

      expect(result.success).toBe(true);
      expect(result.job?.cronSchedule).toBeUndefined();
      expect(result.job?.scheduledJobId).toBeNull();
    });

    it('should create job with empty description', async () => {
      const jobDataWithEmptyDescription = {
        ...validJobData,
        description: '',
      };

      const result = await createJob(jobDataWithEmptyDescription);

      expect(result.success).toBe(true);
      expect(result.job?.description).toBe('');
    });
  });

  describe('permission checks', () => {
    it('should reject when user lacks CREATE_JOBS permission', async () => {
      mockHasPermission.mockResolvedValue(false);

      const result = await createJob(validJobData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Insufficient permissions to create jobs');
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle database insertion errors', async () => {
      mockDb.insert.mockRejectedValue(new Error('Database connection failed'));

      const result = await createJob(validJobData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to create job');
    });

    it('should handle invalid cron schedule', async () => {
      const jobDataWithInvalidCron = {
        ...validJobData,
        cronSchedule: 'invalid-cron',
      };

      const result = await createJob(jobDataWithInvalidCron);

      expect(result.success).toBe(true);
      expect(result.job?.cronSchedule).toBe('invalid-cron');
      expect(result.job?.scheduledJobId).toBeNull();
    });

    it('should handle project context errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('No project context'));

      const result = await createJob(validJobData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to create job');
    });
  });

  describe('data validation', () => {
    it('should validate required fields', async () => {
      const invalidJobData = {
        name: '',
        description: 'Test description',
        tests: [],
      } as CreateJobData;

      const result = await createJob(invalidJobData);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to create job');
    });

    it('should validate test IDs are UUIDs', async () => {
      const jobDataWithInvalidTestId = {
        ...validJobData,
        tests: [{ id: 'invalid-uuid' }],
      };

      const result = await createJob(jobDataWithInvalidTestId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to create job');
    });
  });

  describe('job scheduling', () => {
    it('should schedule job when cron schedule is provided', async () => {
      const result = await createJob(validJobData);

      expect(result.success).toBe(true);
      expect(mockScheduleJob).toHaveBeenCalledWith({
        name: 'Test Job',
        cron: '0 9 * * *',
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        retryLimit: 3
      });
    });

    it('should not schedule job when no cron schedule', async () => {
      const jobDataWithoutCron = {
        ...validJobData,
        cronSchedule: undefined,
      };

      await createJob(jobDataWithoutCron);

      expect(mockScheduleJob).not.toHaveBeenCalled();
    });

    it('should handle scheduling errors gracefully', async () => {
      mockScheduleJob.mockRejectedValue(new Error('Scheduler unavailable'));

      const result = await createJob(validJobData);

      expect(result.success).toBe(true);
      expect(result.job?.scheduledJobId).toBeNull();
    });
  });
});