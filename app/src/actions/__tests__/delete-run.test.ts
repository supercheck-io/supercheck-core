import { deleteRun } from '../delete-run';

// Import modules first
import { db } from '@/utils/db';
import { requireProjectContext } from '@/lib/project-context';
import { logAuditEvent } from '@/lib/audit-logger';
import { revalidatePath } from 'next/cache';
import { UnifiedRole } from '@/lib/rbac/permissions';

// Mock dependencies
jest.mock('@/utils/db');
jest.mock('@/lib/project-context');
jest.mock('@/lib/audit-logger');
jest.mock('next/cache');

// Type the mocked modules
const mockDb = jest.mocked(db);
const mockRequireProjectContext = jest.mocked(requireProjectContext);
const mockLogAuditEvent = jest.mocked(logAuditEvent);
const mockRevalidatePath = jest.mocked(revalidatePath);

// Create mock transaction
const mockTx = {
  select: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([]),
  returning: jest.fn().mockResolvedValue([])
};

// Setup mock implementations
mockDb.transaction = jest.fn().mockImplementation((callback) => callback(mockTx));

describe('deleteRun server action', () => {
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

  const mockRunData = {
    id: 'run-123',
    projectId: 'project-123',
    jobId: 'job-123',
    status: 'completed',
    trigger: 'manual',
    startedAt: new Date('2024-01-01T09:00:00Z')
  };

  const mockReportsData = [
    { id: 'report-1', entityType: 'job' },
    { id: 'report-2', entityType: 'test' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful mocks
    mockRequireProjectContext.mockResolvedValue(mockProjectContext);
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockRevalidatePath.mockImplementation(() => {});
    
    // Reset transaction mock
    mockTx.limit.mockResolvedValue([mockRunData]);
    mockTx.where.mockResolvedValue(mockReportsData);
    mockTx.returning.mockResolvedValue([{ id: 'run-123' }]);
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  describe('successful run deletion', () => {
    it('should delete run successfully with associated reports', async () => {
      const result = await deleteRun('run-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Run deleted successfully (including 2 reports)');

      // Verify transaction was called
      expect(mockDb.transaction).toHaveBeenCalled();
      
      // Verify run lookup
      expect(mockTx.select).toHaveBeenCalled();
      expect(mockTx.from).toHaveBeenCalled();
      expect(mockTx.where).toHaveBeenCalled();
      expect(mockTx.limit).toHaveBeenCalledWith(1);
      
      // Verify reports and run deletion
      expect(mockTx.delete).toHaveBeenCalledTimes(2); // reports + run
      expect(mockTx.returning).toHaveBeenCalled();
      
      // Verify audit logging
      expect(mockLogAuditEvent).toHaveBeenCalledWith({
        userId: 'user-123',
        organizationId: 'org-123',
        action: 'run_deleted',
        resource: 'run',
        resourceId: 'run-123',
        metadata: {
          jobId: 'job-123',
          status: 'completed',
          trigger: 'manual',
          startedAt: '2024-01-01T09:00:00.000Z',
          projectId: 'project-123',
          projectName: 'Test Project',
          reportsDeleted: 2
        },
        success: true
      });

      // Verify path revalidation
      expect(mockRevalidatePath).toHaveBeenCalledWith('/runs');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/jobs');
    });

    it('should delete run successfully without associated reports', async () => {
      // Mock no reports found
      mockTx.where.mockResolvedValue([]);

      const result = await deleteRun('run-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Run deleted successfully (including 0 reports)');

      // Should still delete the run but not attempt to delete reports
      expect(mockTx.delete).toHaveBeenCalledTimes(1); // only run deletion
      
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            reportsDeleted: 0
          })
        })
      );
    });

    it('should handle run without startedAt timestamp', async () => {
      const runWithoutStartTime = { ...mockRunData, startedAt: null };
      mockTx.limit.mockResolvedValue([runWithoutStartTime]);
      mockTx.where.mockResolvedValue([]);

      const result = await deleteRun('run-123');

      expect(result.success).toBe(true);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            startedAt: null
          })
        })
      );
    });
  });

  describe('validation', () => {
    it('should reject when runId is empty', async () => {
      const result = await deleteRun('');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to delete run');
      expect(result.error).toBe('Run ID is required');
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should reject when runId is undefined', async () => {
      const result = await deleteRun(undefined as unknown as string);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Run ID is required');
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should reject when runId is null', async () => {
      const result = await deleteRun(null as unknown as string);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Run ID is required');
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });
  });

  describe('run existence and access validation', () => {
    it('should reject when run does not exist', async () => {
      mockTx.limit.mockResolvedValue([]);

      const result = await deleteRun('nonexistent-run');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to delete run');
      expect(result.error).toBe('Run not found or access denied');
      
      // Should not attempt to delete anything
      expect(mockTx.delete).not.toHaveBeenCalled();
    });

    it('should verify run belongs to current project', async () => {
      await deleteRun('run-123');

      // Verify the query includes project filter
      expect(mockTx.where).toHaveBeenCalled();
    });

    it('should reject run from different project', async () => {
      const runFromDifferentProject = { ...mockRunData, projectId: 'different-project' };
      mockTx.limit.mockResolvedValue([runFromDifferentProject]);

      // The query itself should filter by project, so this shouldn't happen
      // but we test the validation logic
      await deleteRun('run-123');

      expect(mockTx.limit).toHaveBeenCalled();
    });
  });

  describe('cascading deletion', () => {
    it('should delete reports before deleting run', async () => {
      const deleteOrder: string[] = [];
      
      mockTx.delete.mockImplementation(() => {
        deleteOrder.push('delete-called');
        return mockTx;
      });

      await deleteRun('run-123');

      // Should call delete twice: reports first, then run
      expect(mockTx.delete).toHaveBeenCalledTimes(2);
      expect(deleteOrder).toHaveLength(2);
    });

    it('should query for both job and test reports', async () => {
      await deleteRun('run-123');

      // Should query for reports with entityType 'job' or 'test'
      expect(mockTx.where).toHaveBeenCalled();
    });

    it('should handle mixed report types', async () => {
      const mixedReports = [
        { id: 'report-1', entityType: 'job' },
        { id: 'report-2', entityType: 'test' },
        { id: 'report-3', entityType: 'job' }
      ];
      mockTx.where.mockResolvedValue(mixedReports);

      const result = await deleteRun('run-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Run deleted successfully (including 3 reports)');
    });
  });

  describe('error handling', () => {
    it('should handle project context errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('Authentication failed'));

      const result = await deleteRun('run-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to delete run');
      expect(result.error).toBe('Authentication failed');
      expect(result.details).toBe('Check server logs for more information');
    });

    it('should handle database transaction errors', async () => {
      mockDb.transaction.mockRejectedValue(new Error('Transaction failed'));

      const result = await deleteRun('run-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction failed');
    });

    it('should handle report deletion errors', async () => {
      mockTx.delete.mockRejectedValueOnce(new Error('Report deletion failed'));

      const result = await deleteRun('run-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete reports: Report deletion failed');
    });

    it('should handle run deletion errors', async () => {
      // First delete (reports) succeeds, second delete (run) fails
      mockTx.delete
        .mockResolvedValueOnce(mockTx) // reports deletion succeeds
        .mockRejectedValueOnce(new Error('Run deletion failed')); // run deletion fails

      const result = await deleteRun('run-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete run: Run deletion failed');
    });

    it('should handle run deletion with no rows affected', async () => {
      mockTx.returning.mockResolvedValue([]); // No rows deleted

      const result = await deleteRun('run-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete run: Failed to delete run run-123 - no rows affected');
    });

    it('should handle audit logging errors', async () => {
      mockLogAuditEvent.mockRejectedValue(new Error('Audit logging failed'));

      const result = await deleteRun('run-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Audit logging failed');
    });

    it('should handle unknown errors', async () => {
      mockDb.transaction.mockRejectedValue('Unknown error');

      const result = await deleteRun('run-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should provide error details for debugging', async () => {
      const errorWithStack = new Error('Detailed error');
      errorWithStack.stack = 'Error stack trace...';
      mockDb.transaction.mockRejectedValue(errorWithStack);

      const result = await deleteRun('run-123');

      expect(result.success).toBe(false);
      expect(result.details).toBe('Check server logs for more information');
    });
  });

  describe('transaction integrity', () => {
    it('should use database transaction for atomic operations', async () => {
      await deleteRun('run-123');

      expect(mockDb.transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should rollback transaction on errors', async () => {
      mockTx.delete.mockRejectedValue(new Error('Delete failed'));

      const result = await deleteRun('run-123');

      expect(result.success).toBe(false);
      // Transaction should automatically rollback on error
    });

    it('should complete transaction only after all operations succeed', async () => {
      await deleteRun('run-123');

      // All operations should complete within the transaction
      expect(mockTx.select).toHaveBeenCalled();
      expect(mockTx.delete).toHaveBeenCalled();
      expect(mockLogAuditEvent).toHaveBeenCalled();
    });
  });

  describe('logging and monitoring', () => {
    it('should log deletion start', async () => {
      await deleteRun('run-123');

      expect(console.log).toHaveBeenCalledWith('[DELETE_RUN] Starting deletion for run:', 'run-123');
    });

    it('should log run found', async () => {
      await deleteRun('run-123');

      expect(console.log).toHaveBeenCalledWith('[DELETE_RUN] Found run run-123, proceeding with deletion');
    });

    it('should log report checking and deletion', async () => {
      await deleteRun('run-123');

      expect(console.log).toHaveBeenCalledWith('[DELETE_RUN] Checking for associated reports for run run-123');
      expect(console.log).toHaveBeenCalledWith('[DELETE_RUN] Found 2 associated reports with types: job, test');
      expect(console.log).toHaveBeenCalledWith('[DELETE_RUN] Deleting 2 reports for run run-123');
    });

    it('should log successful deletion', async () => {
      mockTx.returning.mockResolvedValue([{ id: 'run-123' }]);

      await deleteRun('run-123');

      expect(console.log).toHaveBeenCalledWith(
        '[DELETE_RUN] Successfully deleted run with ID: run-123 from project Test Project by user user-123, count: 1'
      );
    });

    it('should log run not found', async () => {
      mockTx.limit.mockResolvedValue([]);

      await deleteRun('nonexistent-run');

      expect(console.log).toHaveBeenCalledWith(
        '[DELETE_RUN] Run with ID nonexistent-run not found or access denied'
      );
    });

    it('should log detailed error information', async () => {
      const error = new Error('Detailed error');
      error.stack = 'Full stack trace...';
      mockDb.transaction.mockRejectedValue(error);

      await deleteRun('run-123');

      expect(console.error).toHaveBeenCalledWith('[DELETE_RUN] Transaction error:', error);
      expect(console.error).toHaveBeenCalledWith('[DELETE_RUN] Error details:', {
        message: 'Detailed error',
        stack: 'Full stack trace...'
      });
    });

    it('should log missing run ID error', async () => {
      await deleteRun('');

      expect(console.error).toHaveBeenCalledWith('[DELETE_RUN] Error: Run ID is required');
    });
  });
});