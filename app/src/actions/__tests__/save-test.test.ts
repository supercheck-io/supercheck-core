import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { saveTest, decodeTestScript } from '../save-test';
import type { SaveTestInput } from '../save-test';
import { UnifiedRole } from '@/lib/rbac/permissions';

// Mock all dependencies at the top level
jest.mock('@/utils/db', () => ({
  db: {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  },
}));

jest.mock('@/lib/project-context', () => ({
  requireProjectContext: jest.fn(),
}));

jest.mock('@/lib/rbac/middleware', () => ({
  buildUnifiedPermissionContext: jest.fn(),
  hasPermission: jest.fn(),
}));

jest.mock('@/lib/audit-logger', () => ({
  logAuditEvent: jest.fn(),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(),
}));

// Mock Buffer
const mockBuffer = {
  from: jest.fn().mockImplementation((data: unknown, encoding?: unknown) => ({
    toString: jest.fn().mockImplementation((targetEncoding?: unknown) => {
      if (encoding === 'base64' && targetEncoding === 'utf-8') {
        return 'decoded-script-content';
      }
      if (encoding === 'utf-8' && targetEncoding === 'base64') {
        return 'ZW5jb2RlZC1zY3JpcHQ=';
      }
      return String(data);
    }),
  })),
};
(global as unknown as { Buffer: typeof mockBuffer }).Buffer = mockBuffer;

// Import mocked modules
import { requireProjectContext } from '@/lib/project-context';
import { buildUnifiedPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { logAuditEvent } from '@/lib/audit-logger';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { db } from '@/utils/db';

describe('save-test server action', () => {
  const mockUserId = 'user-123';
  const mockOrganizationId = 'org-123';
  const mockProject = { 
    id: 'project-123', 
    name: 'Test Project',
    organizationId: 'org-123',
    isDefault: false,
    userRole: UnifiedRole.PROJECT_EDITOR
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    (requireProjectContext as jest.MockedFunction<typeof requireProjectContext>).mockResolvedValue({
      userId: mockUserId,
      organizationId: mockOrganizationId,
      project: mockProject,
    });

    (buildUnifiedPermissionContext as jest.MockedFunction<typeof buildUnifiedPermissionContext>).mockResolvedValue({
      type: 'project',
      userId: mockUserId,
      organizationId: mockOrganizationId,
      projectId: mockProject.id,
      role: UnifiedRole.PROJECT_EDITOR
    });
    (hasPermission as jest.MockedFunction<typeof hasPermission>).mockResolvedValue(true);
    (randomUUID as jest.MockedFunction<typeof randomUUID>).mockReturnValue('new-test-id' as ReturnType<typeof randomUUID>);
    
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
    (console.warn as jest.Mock).mockRestore();
  });

  describe('saveTest', () => {
    const validTestData: SaveTestInput = {
      title: 'Test Title',
      description: 'Test Description',
      script: 'test script content',
      priority: 'medium',
      type: 'e2e',
    };

    describe('creating new tests', () => {
      it('should create a new test successfully', async () => {
        const result = await saveTest(validTestData);

        expect(result.success).toBe(true);
        expect(result.id).toBe('new-test-id');

        expect(requireProjectContext).toHaveBeenCalled();
        expect(buildUnifiedPermissionContext).toHaveBeenCalledWith(
          mockUserId,
          'project',
          mockOrganizationId,
          mockProject.id
        );
        expect(hasPermission).toHaveBeenCalled();
        expect(logAuditEvent).toHaveBeenCalledWith({
          userId: mockUserId,
          organizationId: mockOrganizationId,
          action: 'test_created',
          resource: 'test',
          resourceId: 'new-test-id',
          metadata: {
            testTitle: 'Test Title',
            testType: 'e2e',
            projectId: mockProject.id,
            projectName: mockProject.name
          },
          success: true
        });
        expect(revalidatePath).toHaveBeenCalledWith('/tests');
      });

      it('should handle missing required fields', async () => {
        const invalidData = {
          title: '',
          description: 'Test Description',
          script: 'test script content',
          priority: 'medium',
          type: 'e2e',
        } as SaveTestInput;

        const result = await saveTest(invalidData);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should handle permission errors', async () => {
        (hasPermission as jest.MockedFunction<typeof hasPermission>).mockResolvedValue(false);

        const result = await saveTest(validTestData);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Insufficient permissions to edit tests');
      });
    });

    describe('updating existing tests', () => {
      it('should update an existing test successfully', async () => {
        const updateData = {
          ...validTestData,
          id: 'existing-test-id',
        };

        const result = await saveTest(updateData);

        expect(result.success).toBe(true);
        expect(result.id).toBe('existing-test-id');

        expect(logAuditEvent).toHaveBeenCalledWith({
          userId: mockUserId,
          organizationId: mockOrganizationId,
          action: 'test_updated',
          resource: 'test',
          resourceId: 'existing-test-id',
          metadata: {
            testTitle: 'Test Title',
            testType: 'e2e',
            projectId: mockProject.id,
            projectName: mockProject.name
          },
          success: true
        });
      });
    });

    describe('error handling', () => {
      it('should handle database errors', async () => {
        (db.insert as jest.Mock).mockRejectedValue(new Error('Database connection failed') as never);

        const result = await saveTest(validTestData);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should handle project context errors', async () => {
        (requireProjectContext as jest.MockedFunction<typeof requireProjectContext>).mockRejectedValue(new Error('No project context') as never);

        const result = await saveTest(validTestData);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('decodeTestScript', () => {
    it('should decode base64 script correctly', () => {
      const encodedScript = 'dGVzdCBzY3JpcHQgY29udGVudA=='; // "test script content" in base64
      const decoded = decodeTestScript(encodedScript);
      expect(decoded).toBe('decoded-script-content');
    });

    it('should handle null script', () => {
      const decoded = decodeTestScript(null as unknown as string);
      expect(decoded).toBe('');
    });

    it('should handle empty script', () => {
      const decoded = decodeTestScript('');
      expect(decoded).toBe('');
    });

    it('should handle invalid base64 gracefully', () => {
      const invalidScript = 'invalid-base64!@#';
      const decoded = decodeTestScript(invalidScript);
      expect(decoded).toBe('invalid-base64!@#');
    });
  });
});