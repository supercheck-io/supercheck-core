import { GET, POST, PUT } from '../route';
import { NextRequest, NextResponse } from 'next/server';

// Import modules first
import { db } from '@/utils/db';
import { requireProjectContext } from '@/lib/project-context';
import { hasPermission } from '@/lib/rbac/middleware';
import { Role } from '@/lib/rbac/permissions';

// Mock dependencies
jest.mock('@/utils/db');
jest.mock('@/lib/project-context');
jest.mock('@/lib/rbac/middleware');
jest.mock('next/server');

// Type the mocked modules
const mockDb = jest.mocked(db);
const mockRequireProjectContext = jest.mocked(requireProjectContext);
const mockHasPermission = jest.mocked(hasPermission);
const mockNextResponse = jest.mocked(NextResponse);

// Setup mock implementations
mockDb.select = jest.fn().mockReturnThis();
mockDb.insert = jest.fn().mockReturnThis();
mockDb.update = jest.fn().mockReturnThis();
mockDb.delete = jest.fn().mockReturnThis();
mockDb.from = jest.fn().mockReturnThis();
mockDb.where = jest.fn().mockReturnThis();
mockDb.orderBy = jest.fn().mockReturnThis();
mockDb.innerJoin = jest.fn().mockReturnThis();
mockDb.leftJoin = jest.fn().mockReturnThis();
mockDb.values = jest.fn().mockReturnThis();
mockDb.returning = jest.fn().mockResolvedValue([]);
mockDb.limit = jest.fn().mockResolvedValue([]);

describe('Jobs API Route', () => {
  const mockProjectContext = {
    userId: 'user-123',
    project: { 
      id: 'project-123', 
      name: 'Test Project',
      organizationId: 'org-123',
      isDefault: false,
      userRole: Role.PROJECT_EDITOR
    },
    organizationId: 'org-123',
  };

  const mockJobData = {
    id: 'job-123',
    name: 'Test Job',
    description: 'A test job',
    cronSchedule: '0 9 * * *',
    status: 'pending',
    alertConfig: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    organizationId: 'org-123',
    projectId: 'project-123',
    createdByUserId: 'user-123',
    lastRunAt: null,
    nextRunAt: null
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
    
    // Mock NextResponse
    mockNextResponse.json.mockImplementation((data, init) => ({
      json: async () => data,
      status: init?.status || 200,
      ...data
    }) as Response);
    
    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
    (console.log as jest.Mock).mockRestore();
  });

  describe('GET /api/jobs', () => {
    describe('successful requests', () => {
      it('should return jobs with associated tests and runs', async () => {
        // Mock jobs query
        mockDb.orderBy.mockResolvedValue([mockJobData]);
        
        // Mock tests query
        mockDb.innerJoin.mockReturnThis();
        mockDb.where.mockResolvedValue([]);
        
        // Mock tags query
        mockDb.limit.mockResolvedValue([]);
        
        // Mock last run query
        mockDb.orderBy.mockResolvedValue([]);

        await GET();

        expect(mockNextResponse.json).toHaveBeenCalledWith({
          success: true,
          jobs: expect.arrayContaining([
            expect.objectContaining({
              id: 'job-123',
              name: 'Test Job',
              description: 'A test job',
              tests: expect.any(Array),
              lastRun: null
            })
          ])
        });
      });

      it('should check VIEW_JOBS permission', async () => {
        mockDb.orderBy.mockResolvedValue([]);

        await GET();

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
          'VIEW_JOBS'
        );
      });

      it('should format dates as ISO strings', async () => {
        const jobWithDates = {
          ...mockJobData,
          createdAt: new Date('2024-01-01T10:00:00Z'),
          updatedAt: new Date('2024-01-01T11:00:00Z'),
          lastRunAt: new Date('2024-01-01T12:00:00Z'),
          nextRunAt: new Date('2024-01-01T13:00:00Z')
        };
        mockDb.orderBy.mockResolvedValue([jobWithDates]);
        mockDb.where.mockResolvedValue([]);
        mockDb.limit.mockResolvedValue([]);

        await GET();

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                createdAt: '2024-01-01T10:00:00.000Z',
                updatedAt: '2024-01-01T11:00:00.000Z',
                lastRunAt: '2024-01-01T12:00:00.000Z',
                nextRunAt: '2024-01-01T13:00:00.000Z'
              })
            ])
          })
        );
      });

      it('should handle jobs without tests', async () => {
        mockDb.orderBy.mockResolvedValue([mockJobData]);
        mockDb.where.mockResolvedValue([]);
        mockDb.limit.mockResolvedValue([]);

        await GET();

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            jobs: expect.arrayContaining([
              expect.objectContaining({
                tests: []
              })
            ])
          })
        );
      });
    });

    describe('permission checks', () => {
      it('should return 403 when user lacks VIEW_JOBS permission', async () => {
        mockHasPermission.mockResolvedValue(false);

        await GET();

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      });
    });

    describe('error handling', () => {
      it('should handle database errors', async () => {
        mockDb.orderBy.mockRejectedValue(new Error('Database connection failed'));

        await GET();

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Failed to fetch jobs' },
          { status: 500 }
        );
        expect(console.error).toHaveBeenCalledWith('Failed to fetch jobs:', expect.any(Error));
      });

      it('should handle project context errors', async () => {
        mockRequireProjectContext.mockRejectedValue(new Error('Authentication failed'));

        await GET();

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Failed to fetch jobs' },
          { status: 500 }
        );
      });
    });
  });

  describe('POST /api/jobs', () => {
    const mockRequest = {
      url: 'http://localhost:3000/api/jobs',
      json: jest.fn()
    } as unknown as NextRequest;

    describe('job creation', () => {
      it('should create job successfully', async () => {
        const jobData = {
          name: 'New Job',
          description: 'A new test job',
          cronSchedule: '0 10 * * *',
          tests: [{ id: 'test-1' }, { id: 'test-2' }]
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(jobData);
        mockDb.returning.mockResolvedValue([{ id: 'new-job-123' }]);

        await POST(mockRequest);

        expect(mockDb.insert).toHaveBeenCalledTimes(2); // job + job tests
        expect(mockNextResponse.json).toHaveBeenCalledWith({
          success: true,
          job: expect.objectContaining({
            name: 'New Job',
            description: 'A new test job',
            cronSchedule: '0 10 * * *'
          })
        });
      });

      it('should check CREATE_JOBS permission', async () => {
        const jobData = { name: 'New Job', description: 'Test', tests: [] };
        (mockRequest.json as jest.Mock).mockResolvedValue(jobData);

        await POST(mockRequest);

        expect(mockHasPermission).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'project'
          }),
          'CREATE_JOBS'
        );
      });

      it('should validate required fields', async () => {
        const invalidJobData = { description: 'Missing name' };
        (mockRequest.json as jest.Mock).mockResolvedValue(invalidJobData);

        await POST(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          {
            success: false,
            error: 'Missing required field: name is required.'
          },
          { status: 400 }
        );
      });

      it('should handle alert configuration', async () => {
        const jobWithAlerts = {
          name: 'Alert Job',
          description: 'Job with alerts',
          tests: [],
          alertConfig: {
            enabled: true,
            notificationProviders: ['provider-1'],
            alertOnFailure: true,
            alertOnSuccess: false,
            alertOnTimeout: true,
            failureThreshold: 2,
            recoveryThreshold: 1,
            customMessage: 'Custom message'
          }
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(jobWithAlerts);
        mockDb.returning.mockResolvedValue([{ id: 'alert-job-123' }]);

        await POST(mockRequest);

        expect(mockDb.insert).toHaveBeenCalledWith(
          expect.objectContaining({
            alertConfig: expect.objectContaining({
              enabled: true,
              notificationProviders: ['provider-1'],
              alertOnFailure: true
            })
          })
        );
      });

      it('should validate alert configuration', async () => {
        const invalidAlertJob = {
          name: 'Invalid Alert Job',
          description: 'Test',
          tests: [],
          alertConfig: {
            enabled: true,
            notificationProviders: [], // Empty providers
            alertOnFailure: false,
            alertOnSuccess: false,
            alertOnTimeout: false
          }
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(invalidAlertJob);

        await POST(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { error: 'At least one notification channel must be selected when alerts are enabled' },
          { status: 400 }
        );
      });
    });

    describe('job execution', () => {
      it('should handle job run request', async () => {
        const runRequest = {
          url: 'http://localhost:3000/api/jobs?action=run',
          json: jest.fn().mockResolvedValue({
            jobId: 'job-123',
            tests: [{ id: 'test-1', script: 'test("example", () => {})' }]
          })
        } as unknown as NextRequest;

        // Mock URL constructor
        Object.defineProperty(global, 'URL', {
          value: jest.fn().mockImplementation(() => ({
            searchParams: {
              get: jest.fn().mockReturnValue('run')
            }
          })),
          writable: true
        });

        mockDb.values.mockResolvedValue([]);

        await POST(runRequest);

        expect(mockDb.insert).toHaveBeenCalled(); // run record creation
      });

      it('should validate run request data', async () => {
        const invalidRunRequest = {
          url: 'http://localhost:3000/api/jobs?action=run',
          json: jest.fn().mockResolvedValue({
            jobId: '', // Invalid job ID
            tests: []
          })
        } as unknown as NextRequest;

        Object.defineProperty(global, 'URL', {
          value: jest.fn().mockImplementation(() => ({
            searchParams: {
              get: jest.fn().mockReturnValue('run')
            }
          })),
          writable: true
        });

        await POST(invalidRunRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { error: 'Invalid job data. Job ID and tests are required.' },
          { status: 400 }
        );
      });
    });

    describe('permission checks', () => {
      it('should return 403 when user lacks CREATE_JOBS permission', async () => {
        mockHasPermission.mockResolvedValue(false);
        const jobData = { name: 'Test Job', description: 'Test', tests: [] };
        (mockRequest.json as jest.Mock).mockResolvedValue(jobData);

        await POST(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { error: 'Insufficient permissions to create jobs' },
          { status: 403 }
        );
      });
    });

    describe('error handling', () => {
      it('should handle database errors', async () => {
        const jobData = { name: 'Test Job', description: 'Test', tests: [] };
        (mockRequest.json as jest.Mock).mockResolvedValue(jobData);
        mockDb.insert.mockRejectedValue(new Error('Database error'));

        await POST(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Failed to create job' },
          { status: 500 }
        );
        expect(console.error).toHaveBeenCalledWith('Error creating job:', expect.any(Error));
      });

      it('should handle project context errors', async () => {
        mockRequireProjectContext.mockRejectedValue(new Error('Auth error'));
        const jobData = { name: 'Test Job', description: 'Test', tests: [] };
        (mockRequest.json as jest.Mock).mockResolvedValue(jobData);

        await POST(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Failed to create job' },
          { status: 500 }
        );
      });
    });
  });

  describe('PUT /api/jobs', () => {
    const mockRequest = {
      json: jest.fn()
    } as unknown as Request;

    describe('job updates', () => {
      it('should update job successfully', async () => {
        const updateData = {
          id: 'job-123',
          name: 'Updated Job',
          description: 'Updated description',
          cronSchedule: '0 11 * * *'
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(updateData);
        
        // Mock existing job check
        mockDb.limit.mockResolvedValue([{
          id: 'job-123',
          projectId: 'project-123',
          organizationId: 'org-123'
        }]);

        await PUT(mockRequest);

        expect(mockDb.update).toHaveBeenCalled();
        expect(mockNextResponse.json).toHaveBeenCalledWith({
          success: true,
          job: expect.objectContaining({
            id: 'job-123',
            name: 'Updated Job',
            description: 'Updated description',
            cronSchedule: '0 11 * * *'
          })
        });
      });

      it('should check EDIT_JOBS permission', async () => {
        const updateData = {
          id: 'job-123',
          name: 'Updated Job',
          description: 'Updated',
          cronSchedule: '0 11 * * *'
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(updateData);
        mockDb.limit.mockResolvedValue([{
          id: 'job-123',
          projectId: 'project-123',
          organizationId: 'org-123'
        }]);

        await PUT(mockRequest);

        expect(mockHasPermission).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'project'
          }),
          'EDIT_JOBS'
        );
      });

      it('should validate required fields for update', async () => {
        const invalidUpdateData = {
          id: 'job-123',
          name: '', // Empty name
          description: 'Test',
          cronSchedule: '0 11 * * *'
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(invalidUpdateData);

        await PUT(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          {
            success: false,
            error: 'Missing required fields. Name, description, and cron schedule are required.'
          },
          { status: 400 }
        );
      });

      it('should validate job exists and belongs to project', async () => {
        const updateData = {
          id: 'job-123',
          name: 'Updated Job',
          description: 'Updated',
          cronSchedule: '0 11 * * *'
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(updateData);
        mockDb.limit.mockResolvedValue([]); // Job not found

        await PUT(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      });

      it('should update job-test associations', async () => {
        const updateDataWithTests = {
          id: 'job-123',
          name: 'Updated Job',
          description: 'Updated',
          cronSchedule: '0 11 * * *',
          tests: [{ id: 'test-1' }, { id: 'test-2' }]
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(updateDataWithTests);
        mockDb.limit.mockResolvedValue([{
          id: 'job-123',
          projectId: 'project-123',
          organizationId: 'org-123'
        }]);

        await PUT(mockRequest);

        // Should delete existing associations and create new ones
        expect(mockDb.delete).toHaveBeenCalled();
        expect(mockDb.insert).toHaveBeenCalled();
      });
    });

    describe('permission checks', () => {
      it('should return 403 when user lacks EDIT_JOBS permission', async () => {
        mockHasPermission.mockResolvedValue(false);
        const updateData = {
          id: 'job-123',
          name: 'Updated Job',
          description: 'Updated',
          cronSchedule: '0 11 * * *'
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(updateData);
        mockDb.limit.mockResolvedValue([{
          id: 'job-123',
          projectId: 'project-123',
          organizationId: 'org-123'
        }]);

        await PUT(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { error: 'Insufficient permissions to edit jobs' },
          { status: 403 }
        );
      });
    });

    describe('error handling', () => {
      it('should handle missing job ID', async () => {
        const updateDataWithoutId = {
          name: 'Updated Job',
          description: 'Updated',
          cronSchedule: '0 11 * * *'
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(updateDataWithoutId);

        await PUT(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Job ID is required' },
          { status: 400 }
        );
      });

      it('should handle database update errors', async () => {
        const updateData = {
          id: 'job-123',
          name: 'Updated Job',
          description: 'Updated',
          cronSchedule: '0 11 * * *'
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(updateData);
        mockDb.limit.mockResolvedValue([{
          id: 'job-123',
          projectId: 'project-123',
          organizationId: 'org-123'
        }]);
        mockDb.update.mockRejectedValue(new Error('Update failed'));

        await PUT(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Failed to update job' },
          { status: 500 }
        );
        expect(console.error).toHaveBeenCalledWith('Error updating job:', expect.any(Error));
      });

      it('should handle authentication errors', async () => {
        mockRequireProjectContext.mockRejectedValue(new Error('Authentication required'));
        const updateData = {
          id: 'job-123',
          name: 'Updated Job',
          description: 'Updated',
          cronSchedule: '0 11 * * *'
        };

        (mockRequest.json as jest.Mock).mockResolvedValue(updateData);

        await PUT(mockRequest);

        expect(mockNextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Authentication required' },
          { status: 401 }
        );
      });
    });
  });
});