import { deleteTest } from '../delete-test';

// Import modules first
import { db } from '@/utils/db';
import { requireProjectContext } from '@/lib/project-context';
import { buildPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { logAuditEvent } from '@/lib/audit-logger';
import { revalidatePath } from 'next/cache';
import { ProjectRole } from '@/lib/rbac/permissions';

// Mock dependencies
jest.mock('@/utils/db');
jest.mock('@/lib/project-context');
jest.mock('@/lib/rbac/middleware');
jest.mock('@/lib/audit-logger');
jest.mock('next/cache');

// Type the mocked modules
const mockDb = jest.mocked(db);
const mockRequireProjectContext = jest.mocked(requireProjectContext);
const mockBuildPermissionContext = jest.mocked(buildPermissionContext);
const mockHasPermission = jest.mocked(hasPermission);
const mockLogAuditEvent = jest.mocked(logAuditEvent);
const mockRevalidatePath = jest.mocked(revalidatePath);

// Setup mock implementations with proper chaining
const mockSelect = jest.fn().mockReturnThis();
const mockFrom = jest.fn().mockReturnThis();
const mockWhere = jest.fn().mockReturnThis();
const mockLimit = jest.fn();
const mockDelete = jest.fn().mockReturnThis();
const mockReturning = jest.fn();

// Mock the database object with proper method chaining
Object.assign(mockDb, {
  select: mockSelect,
  from: mockFrom,
  where: mockWhere,
  limit: mockLimit,
  delete: mockDelete,
  returning: mockReturning,
});

describe('delete-test server action', () => {

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

  const mockExistingTest = {
    id: 'test-123',
    title: 'Test to Delete',
    type: 'e2e',
    priority: 'high',
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

  describe('successful deletion', () => {
    it('should delete test successfully', async () => {
      // Mock test exists check (first query chain)
      mockLimit.mockResolvedValueOnce([mockExistingTest]);
      // Mock job count check - no associations (second query chain)
      mockLimit.mockResolvedValueOnce([{ count: 0 }]);
      // Mock successful deletion
      mockReturning.mockResolvedValue([mockExistingTest]);

      const result = await deleteTest('test-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Test deleted successfully');
      expect(result.error).toBeUndefined();

      // Verify permissions were checked
      expect(mockRequireProjectContext).toHaveBeenCalled();
      expect(mockBuildPermissionContext).toHaveBeenCalledWith(
        'user-123',
        'project',
        'org-123',
        'project-123'
      );
      expect(mockHasPermission).toHaveBeenCalled();

      // Verify test existence was checked
      expect(mockSelect).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();

      // Verify job associations were checked (second limit call)
      expect(mockLimit).toHaveBeenCalledTimes(2);

      // Verify deletion was performed
      expect(mockDelete).toHaveBeenCalled();
      expect(mockReturning).toHaveBeenCalled();

      // Verify audit logging
      expect(mockLogAuditEvent).toHaveBeenCalledWith({
        userId: 'user-123',
        organizationId: 'org-123',
        action: 'test_deleted',
        resource: 'test',
        resourceId: 'test-123',
        metadata: {
          testTitle: 'Test to Delete',
          testType: 'e2e',
          testPriority: 'high',
          projectId: 'project-123',
          projectName: 'Test Project',
        },
        success: true,
      });

      // Verify cache revalidation
      expect(mockRevalidatePath).toHaveBeenCalledWith('/tests');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/jobs');
    });
  });

  describe('validation errors', () => {
    it('should fail when testId is missing', async () => {
      const result = await deleteTest('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test ID is required');

      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });

    it('should fail when testId is null', async () => {
      const result = await deleteTest(null as unknown as string);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test ID is required');
    });

    it('should fail when testId is undefined', async () => {
      const result = await deleteTest(undefined as unknown as string);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test ID is required');
    });
  });

  describe('permission handling', () => {
    it('should fail when user lacks DELETE_TESTS permission', async () => {
      mockHasPermission.mockResolvedValue(false);

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient permissions to delete tests');

      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        'User user-123 attempted to delete test test-123 without DELETE_TESTS permission'
      );
    });

    it('should handle project context errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('No project context'));

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No project context');
    });

    it('should handle permission context build errors', async () => {
      mockBuildPermissionContext.mockRejectedValue(new Error('Permission context failed'));

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission context failed');
    });
  });

  describe('test existence validation', () => {
    it('should fail when test does not exist', async () => {
      // Mock test not found
      mockLimit.mockResolvedValueOnce([]);

      const result = await deleteTest('non-existent-test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test not found or access denied');
      expect(result.errorCode).toBe(404);

      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });

    it('should fail when test exists but not in current project', async () => {
      // Mock empty result due to project/org scoping
      mockLimit.mockResolvedValueOnce([]);

      const result = await deleteTest('other-project-test');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test not found or access denied');
      expect(result.errorCode).toBe(404);
    });
  });

  describe('job association validation', () => {
    it('should fail when test is associated with jobs', async () => {
      // Mock test exists
      mockLimit.mockResolvedValueOnce([mockExistingTest]);
      // Mock job associations exist
      mockLimit.mockResolvedValueOnce([{ count: 2 }]);

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Test cannot be deleted because it is currently used in one or more jobs. Please remove it from the jobs first.'
      );
      expect(result.errorCode).toBe(409);

      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });

    it('should handle job count query with null result', async () => {
      // Mock test exists
      mockLimit.mockResolvedValueOnce([mockExistingTest]);
      // Mock job count with null
      mockLimit.mockResolvedValueOnce([{ count: null }]);

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        'Test cannot be deleted because it is currently used in one or more jobs. Please remove it from the jobs first.'
      );
    });

    it('should handle job count query with undefined result', async () => {
      // Mock test exists
      mockLimit.mockResolvedValueOnce([mockExistingTest]);
      // Mock job count with undefined count property
      mockLimit.mockResolvedValueOnce([{}]);
      // Mock successful deletion for this case
      mockReturning.mockResolvedValue([mockExistingTest]);

      const result = await deleteTest('test-123');

      // Should treat undefined count as 0 and allow deletion
      expect(result.success).toBe(true);
    });

    it('should handle empty job count result array', async () => {
      // Mock test exists
      mockLimit.mockResolvedValueOnce([mockExistingTest]);
      // Mock empty job count result
      mockLimit.mockResolvedValueOnce([]);
      // Mock successful deletion for this case
      mockReturning.mockResolvedValue([mockExistingTest]);

      const result = await deleteTest('test-123');

      // Should treat empty array as 0 count and allow deletion
      expect(result.success).toBe(true);
    });
  });

  describe('database deletion errors', () => {
    beforeEach(() => {
      // Mock test exists and no job associations
      mockLimit.mockResolvedValueOnce([mockExistingTest]);
      mockLimit.mockResolvedValueOnce([{ count: 0 }]);
    });

    it('should handle deletion returning empty result', async () => {
      mockReturning.mockResolvedValue([]); // No rows deleted

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test not found');
      expect(result.errorCode).toBe(404);

      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });

    it('should handle database deletion errors', async () => {
      mockReturning.mockRejectedValue(new Error('Database connection failed'));

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');

      expect(console.error).toHaveBeenCalledWith(
        'Error deleting test:',
        expect.any(Error)
      );
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      mockReturning.mockRejectedValue('String error');

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete test');
    });
  });

  describe('audit logging', () => {
    beforeEach(() => {
      // Mock successful flow
      mockLimit.mockResolvedValueOnce([mockExistingTest]);
      mockLimit.mockResolvedValueOnce([{ count: 0 }]);
      mockReturning.mockResolvedValue([mockExistingTest]);
    });

    it('should handle audit logging errors gracefully', async () => {
      mockLogAuditEvent.mockRejectedValue(new Error('Audit service unavailable'));

      const result = await deleteTest('test-123');

      // Should fail since audit logging is awaited
      expect(result.success).toBe(false);
      expect(result.error).toBe('Audit service unavailable');
    });

    it('should log correct audit data for test with different properties', async () => {
      const testWithDifferentProps = {
        id: 'test-456',
        title: 'API Integration Test',
        type: 'api',
        priority: 'low',
      };

      // Mock test exists
      mockLimit.mockResolvedValueOnce([testWithDifferentProps]);
      // Mock no job associations  
      mockLimit.mockResolvedValueOnce([{ count: 0 }]);
      // Mock successful deletion
      mockReturning.mockResolvedValue([testWithDifferentProps]);

      await deleteTest('test-456');

      expect(mockLogAuditEvent).toHaveBeenCalledWith({
        userId: 'user-123',
        organizationId: 'org-123',
        action: 'test_deleted',
        resource: 'test',
        resourceId: 'test-456',
        metadata: {
          testTitle: 'API Integration Test',
          testType: 'api',
          testPriority: 'low',
          projectId: 'project-123',
          projectName: 'Test Project',
        },
        success: true,
      });
    });
  });

  describe('error handling edge cases', () => {
    it('should handle database query errors during test existence check', async () => {
      // Mock the first limit call to fail (test existence check)
      mockLimit.mockRejectedValueOnce(new Error('Database query failed'));

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database query failed');
    });

    it('should handle database query errors during job association check', async () => {
      // Mock test exists successfully
      mockLimit.mockResolvedValueOnce([mockExistingTest]);
      // Mock job count query to fail
      mockLimit.mockRejectedValueOnce(new Error('Job count query failed'));

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Job count query failed');
    });

    it('should handle permission check errors', async () => {
      mockHasPermission.mockRejectedValue(new Error('Permission check failed'));

      const result = await deleteTest('test-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Permission check failed');
    });
  });

  describe('integration scenarios', () => {
    it('should complete full successful deletion flow', async () => {
      // Setup complete successful scenario
      mockLimit.mockResolvedValueOnce([mockExistingTest]);
      mockLimit.mockResolvedValueOnce([{ count: 0 }]);
      mockReturning.mockResolvedValue([mockExistingTest]);

      const result = await deleteTest('test-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Test deleted successfully');

      // Verify complete flow was executed
      expect(mockRequireProjectContext).toHaveBeenCalled();
      expect(mockHasPermission).toHaveBeenCalled();
      expect(mockSelect).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
      expect(mockLogAuditEvent).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledTimes(2);

      expect(console.log).toHaveBeenCalledWith('Deleting test with ID:', 'test-123');
      expect(console.log).toHaveBeenCalledWith(
        'Successfully deleted test test-123 from project Test Project by user user-123'
      );
    });

    it('should handle test with null/undefined properties', async () => {
      const testWithNulls = {
        id: 'test-789',
        title: undefined,
        type: undefined,
        priority: undefined,
      };

      // Mock test exists
      mockLimit.mockResolvedValueOnce([testWithNulls]);
      // Mock no job associations
      mockLimit.mockResolvedValueOnce([{ count: 0 }]);
      // Mock successful deletion
      mockReturning.mockResolvedValue([testWithNulls]);

      const result = await deleteTest('test-789');

      expect(result.success).toBe(true);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            testTitle: undefined,
            testType: undefined,
            testPriority: undefined,
          }),
        })
      );
    });
  });
});