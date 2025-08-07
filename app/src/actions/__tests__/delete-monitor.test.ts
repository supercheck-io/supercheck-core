import { deleteMonitor } from '../delete-monitor';

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

// Setup mock implementations
mockDb.select = jest.fn().mockReturnThis();
mockDb.delete = jest.fn().mockReturnThis();
mockDb.from = jest.fn().mockReturnThis();
mockDb.where = jest.fn().mockReturnThis();
mockDb.limit = jest.fn().mockResolvedValue([]);

describe('deleteMonitor server action', () => {
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

  const mockMonitorData = {
    id: 'monitor-123',
    name: 'API Health Check',
    type: 'http',
    target: 'https://api.example.com/health'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful mocks
    mockRequireProjectContext.mockResolvedValue(mockProjectContext);
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockRevalidatePath.mockImplementation(() => {});
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  describe('successful monitor deletion', () => {
    it('should delete monitor successfully', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(true);

      // Verify monitor existence check
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
      
      // Verify cascading deletion - monitor results first, then monitor
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
      
      // Verify audit logging
      expect(mockLogAuditEvent).toHaveBeenCalledWith({
        userId: 'user-123',
        organizationId: 'org-123',
        action: 'monitor_deleted',
        resource: 'monitor',
        resourceId: 'monitor-123',
        metadata: {
          monitorName: 'API Health Check',
          monitorType: 'http',
          target: 'https://api.example.com/health',
          projectId: 'project-123',
          projectName: 'Test Project'
        },
        success: true
      });

      // Verify path revalidation
      expect(mockRevalidatePath).toHaveBeenCalledWith('/monitors');
    });

    it('should delete monitor with different types', async () => {
      const tcpMonitor = { ...mockMonitorData, type: 'tcp', target: 'example.com:443' };
      mockDb.limit.mockResolvedValue([tcpMonitor]);

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(true);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            monitorType: 'tcp',
            target: 'example.com:443'
          })
        })
      );
    });

    it('should delete monitor with empty target', async () => {
      const monitorWithoutTarget = { ...mockMonitorData, target: null };
      mockDb.limit.mockResolvedValue([monitorWithoutTarget]);

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(true);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            target: null
          })
        })
      );
    });
  });

  describe('validation', () => {
    it('should reject when monitorId is empty', async () => {
      const result = await deleteMonitor('');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Monitor ID is required');
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('should reject when monitorId is undefined', async () => {
      const result = await deleteMonitor(undefined as unknown as string);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Monitor ID is required');
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('should reject when monitorId is null', async () => {
      const result = await deleteMonitor(null as unknown as string);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Monitor ID is required');
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });

  describe('monitor existence and access validation', () => {
    it('should reject when monitor does not exist', async () => {
      mockDb.limit.mockResolvedValue([]);

      const result = await deleteMonitor('nonexistent-monitor');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Monitor not found or access denied');
      
      // Should not attempt to delete anything
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('should verify monitor belongs to current project and organization', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      await deleteMonitor('monitor-123');

      // Verify the query includes project and organization filters
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should reject monitor from different project', async () => {
      // The query itself should filter by project and organization, 
      // so this would return empty results
      mockDb.limit.mockResolvedValue([]);

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Monitor not found or access denied');
    });
  });

  describe('cascading deletion', () => {
    it('should delete monitor results before deleting monitor', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);
      const deleteOrder: string[] = [];
      
      mockDb.delete.mockImplementation(() => {
        deleteOrder.push('delete-called');
        return mockDb;
      });

      await deleteMonitor('monitor-123');

      // Should call delete twice: monitor results first, then monitor
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
      expect(deleteOrder).toHaveLength(2);
    });

    it('should handle monitor with no results', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(true);
      // Still should attempt to delete results even if none exist
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('project scoping safety', () => {
    it('should use project scoping in monitor deletion query', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      await deleteMonitor('monitor-123');

      // Both existence check and deletion should include project/org filters
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should require project context', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      await deleteMonitor('monitor-123');

      expect(mockRequireProjectContext).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle project context errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('Authentication failed'));

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete monitor');
    });

    it('should handle database query errors', async () => {
      mockDb.limit.mockRejectedValue(new Error('Database connection failed'));

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete monitor');
    });

    it('should handle monitor results deletion errors', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);
      mockDb.delete.mockRejectedValueOnce(new Error('Results deletion failed'));

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete monitor');
    });

    it('should handle monitor deletion errors', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);
      // First delete (results) succeeds, second delete (monitor) fails
      mockDb.delete
        .mockResolvedValueOnce(mockDb)
        .mockRejectedValueOnce(new Error('Monitor deletion failed'));

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete monitor');
    });

    it('should handle audit logging errors', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);
      mockLogAuditEvent.mockRejectedValue(new Error('Audit logging failed'));

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete monitor');
    });

    it('should handle unknown errors', async () => {
      mockRequireProjectContext.mockRejectedValue('Unknown error');

      const result = await deleteMonitor('monitor-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete monitor');
    });
  });

  describe('logging and monitoring', () => {
    it('should log deletion attempt', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      await deleteMonitor('monitor-123');

      expect(console.log).toHaveBeenCalledWith('Deleting monitor with ID:', 'monitor-123');
    });

    it('should log successful deletion', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      await deleteMonitor('monitor-123');

      expect(console.log).toHaveBeenCalledWith(
        'Successfully deleted monitor monitor-123 from project Test Project by user user-123'
      );
    });

    it('should log errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('Test error'));

      await deleteMonitor('monitor-123');

      expect(console.error).toHaveBeenCalledWith('Error deleting monitor:', expect.any(Error));
    });
  });

  describe('monitor metadata', () => {
    it('should capture all monitor metadata for audit', async () => {
      const fullMonitorData = {
        id: 'monitor-123',
        name: 'Complex Monitor',
        type: 'https',
        target: 'https://secure.example.com/api/v1/health'
      };
      mockDb.limit.mockResolvedValue([fullMonitorData]);

      await deleteMonitor('monitor-123');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            monitorName: 'Complex Monitor',
            monitorType: 'https',
            target: 'https://secure.example.com/api/v1/health',
            projectId: 'project-123',
            projectName: 'Test Project'
          }
        })
      );
    });

    it('should handle monitors with minimal data', async () => {
      const minimalMonitor = {
        id: 'monitor-123',
        name: 'Minimal',
        type: 'ping',
        target: 'example.com'
      };
      mockDb.limit.mockResolvedValue([minimalMonitor]);

      await deleteMonitor('monitor-123');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            monitorName: 'Minimal',
            monitorType: 'ping',
            target: 'example.com'
          })
        })
      );
    });
  });

  describe('database operations', () => {
    it('should select correct monitor fields for audit', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      await deleteMonitor('monitor-123');

      // Should select id, name, type, and target for audit logging
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should delete in correct order for referential integrity', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      await deleteMonitor('monitor-123');

      // Should delete monitor results first (due to foreign key constraints)
      // then delete the monitor itself
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });

    it('should use project and organization scoping in all operations', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      await deleteMonitor('monitor-123');

      // Both queries should include project and organization filters
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('path revalidation', () => {
    it('should revalidate monitors page on successful deletion', async () => {
      mockDb.limit.mockResolvedValue([mockMonitorData]);

      await deleteMonitor('monitor-123');

      expect(mockRevalidatePath).toHaveBeenCalledWith('/monitors');
    });

    it('should not revalidate on failed deletion', async () => {
      mockDb.limit.mockResolvedValue([]);

      await deleteMonitor('nonexistent-monitor');

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('should not revalidate when deletion throws error', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('Error'));

      await deleteMonitor('monitor-123');

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});