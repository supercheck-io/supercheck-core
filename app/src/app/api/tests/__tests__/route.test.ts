import { GET, POST } from '../route';
import { ProjectRole } from '@/lib/rbac/permissions';

// Mock NextRequest and NextResponse
const mockJson = jest.fn();
const mockNextRequest = jest.fn().mockImplementation((url, options) => ({
  url,
  method: options?.method || 'GET',
  json: mockJson,
  ...options,
}));

const mockNextResponse = {
  json: jest.fn().mockImplementation((data, options) => ({
    json: jest.fn().mockResolvedValue(data),
    status: options?.status || 200,
  })),
};

jest.mock('next/server', () => ({
  NextRequest: mockNextRequest,
  NextResponse: mockNextResponse,
}));

// Mock dependencies
jest.mock('@/utils/db', () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    orderBy: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  },
}));

jest.mock('@/lib/rbac/middleware', () => ({
  buildPermissionContext: jest.fn(),
  hasPermission: jest.fn(),
}));

jest.mock('@/lib/project-context', () => ({
  requireProjectContext: jest.fn(),
}));

// Import mocked modules
import { db } from '@/utils/db';
import { buildPermissionContext, hasPermission } from '@/lib/rbac/middleware';
import { requireProjectContext } from '@/lib/project-context';
import type { NextRequest } from 'next/server';

// Type the mocked modules
const mockDb = db as jest.Mocked<typeof db> & {
  orderBy: jest.Mock;
  where: jest.Mock;
  returning: jest.Mock;
  values: jest.Mock;
};
const mockBuildPermissionContext = buildPermissionContext as jest.MockedFunction<typeof buildPermissionContext>;
const mockHasPermission = hasPermission as jest.MockedFunction<typeof hasPermission>;
const mockRequireProjectContext = requireProjectContext as jest.MockedFunction<typeof requireProjectContext>;

describe('Tests API Route', () => {

  const mockProjectContext = {
    userId: 'user-123',
    project: { 
      id: 'project-123', 
      name: 'Test Project',
      organizationId: 'org-123',
      isDefault: false,
      userRole: 'admin'
    },
    organizationId: 'org-123',
  };

  const mockTests = [
    {
      id: 'test-1',
      title: 'Login Test',
      description: 'Test user login functionality',
      priority: 'high',
      type: 'e2e',
      script: 'dGVzdCgnbG9naW4nLCAoKSA9PiB7fSk=', // base64 encoded test script
      projectId: 'project-123',
      organizationId: 'org-123',
      createdByUserId: 'user-123',
      createdAt: new Date('2024-01-01T12:00:00Z'),
      updatedAt: new Date('2024-01-01T12:00:00Z'),
    },
    {
      id: 'test-2',
      title: 'Navigation Test',
      description: 'Test navigation between pages',
      priority: 'medium',
      type: 'e2e',
      script: null,
      projectId: 'project-123',
      organizationId: 'org-123',
      createdByUserId: 'user-123',
      createdAt: new Date('2024-01-01T11:00:00Z'),
      updatedAt: new Date('2024-01-01T11:00:00Z'),
    },
  ];

  const mockTestTags = [
    {
      testId: 'test-1',
      tagId: 'tag-1',
      tagName: 'authentication',
      tagColor: '#FF5733',
    },
    {
      testId: 'test-1',
      tagId: 'tag-2',
      tagName: 'critical',
      tagColor: '#DC143C',
    },
  ];

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
    
    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  describe('GET /api/tests', () => {
    beforeEach(() => {
      mockDb.orderBy.mockResolvedValue(mockTests);
      mockDb.where.mockResolvedValue(mockTestTags);
    });

    it('should return tests successfully with tags', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);

      // Verify first test structure
      expect(data[0]).toEqual({
        id: 'test-1',
        title: 'Login Test',
        description: 'Test user login functionality',
        priority: 'high',
        type: 'e2e',
        script: "test('login', () => {})", // decoded base64
        tags: [
          { id: 'tag-1', name: 'authentication', color: '#FF5733' },
          { id: 'tag-2', name: 'critical', color: '#DC143C' },
        ],
        createdAt: '2024-01-01T12:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z',
      });

      // Verify second test structure (no script, no tags)
      expect(data[1]).toEqual({
        id: 'test-2',
        title: 'Navigation Test',
        description: 'Test navigation between pages',
        priority: 'medium',
        type: 'e2e',
        script: '',
        tags: [],
        createdAt: '2024-01-01T11:00:00.000Z',
        updatedAt: '2024-01-01T11:00:00.000Z',
      });

      expect(requireProjectContext).toHaveBeenCalled();
      expect(buildPermissionContext).toHaveBeenCalledWith(
        'user-123',
        'project',
        'org-123',
        'project-123'
      );
      expect(hasPermission).toHaveBeenCalled();
    });

    it('should return 403 when user lacks VIEW_TESTS permission', async () => {
      mockHasPermission.mockResolvedValue(false);

      const response = await GET();

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
    });

    it('should handle project context errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('No project context') as never);

      const response = await GET();

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch tests');
    });

    it('should handle database query errors', async () => {
      mockDb.orderBy.mockRejectedValue(new Error('Database connection failed') as never);

      const response = await GET();

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch tests');
    });

    it('should handle empty test results', async () => {
      mockDb.orderBy.mockResolvedValue([]);
      mockDb.where.mockResolvedValue([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([]);
    });

    it('should handle tests without tags', async () => {
      mockDb.where.mockResolvedValue([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data[0].tags).toEqual([]);
      expect(data[1].tags).toEqual([]);
    });

    it('should handle malformed base64 scripts', async () => {
      const testsWithBadScript = [
        {
          ...mockTests[0],
          script: 'not-valid-base64!@#',
        },
      ];
      mockDb.orderBy.mockResolvedValue(testsWithBadScript);
      mockDb.where.mockResolvedValue([]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data[0].script).toBe('not-valid-base64!@#'); // returned as-is
    });

    it('should include development error details in dev environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });
      
      const testError = new Error('Detailed database error');
      mockDb.orderBy.mockRejectedValue(testError as never);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch tests');
      expect(data.details).toBe('Detailed database error');

      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
    });

    it('should not include error details in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
      
      const testError = new Error('Detailed database error');
      mockDb.orderBy.mockRejectedValue(testError as never);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to fetch tests');
      expect(data.details).toBeUndefined();

      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
    });

    it('should handle permission context build errors', async () => {
      mockBuildPermissionContext.mockRejectedValue(new Error('Permission context failed') as never);

      const response = await GET();

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch tests');
    });
  });

  describe('POST /api/tests', () => {
    const validTestData = {
      title: 'New Test',
      description: 'A new test description',
      priority: 'high',
      type: 'e2e',
      script: 'test("new test", () => { expect(true).toBe(true); })',
    };

    const mockNewTest = {
      id: 'test-new',
      title: 'New Test',
      description: 'A new test description',
      priority: 'high',
      type: 'e2e',
      script: 'test("new test", () => { expect(true).toBe(true); })',
      projectId: 'project-123',
      organizationId: 'org-123',
      createdByUserId: 'user-123',
      createdAt: new Date('2024-01-01T12:00:00Z'),
      updatedAt: new Date('2024-01-01T12:00:00Z'),
    };

    beforeEach(() => {
      mockDb.returning.mockResolvedValue([mockNewTest]);
      mockJson.mockResolvedValue(validTestData);
    });

    it('should create test successfully with all fields', async () => {
      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.test).toEqual({
        id: 'test-new',
        title: 'New Test',
        description: 'A new test description',
        priority: 'high',
        type: 'e2e',
        script: 'test("new test", () => { expect(true).toBe(true); })',
        projectId: 'project-123',
        organizationId: 'org-123',
        createdAt: '2024-01-01T12:00:00.000Z',
        updatedAt: '2024-01-01T12:00:00.000Z',
        tags: [],
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        title: 'New Test',
        description: 'A new test description',
        priority: 'high',
        type: 'e2e',
        script: 'test("new test", () => { expect(true).toBe(true); })',
        projectId: 'project-123',
        organizationId: 'org-123',
        createdByUserId: 'user-123',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      expect(requireProjectContext).toHaveBeenCalled();
      expect(buildPermissionContext).toHaveBeenCalledWith(
        'user-123',
        'project',
        'org-123',
        'project-123'
      );
    });

    it('should create test with minimal data', async () => {
      const minimalTestData = {
        title: 'Minimal Test',
      };

      const minimalMockTest = {
        ...mockNewTest,
        title: 'Minimal Test',
        description: null,
        priority: 'medium',
        type: 'e2e',
        script: null,
      };

      mockJson.mockResolvedValue(minimalTestData);
      mockDb.returning.mockResolvedValue([minimalMockTest]);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.test.title).toBe('Minimal Test');
      expect(data.test.description).toBeNull();
      expect(data.test.priority).toBe('medium');
      expect(data.test.type).toBe('e2e');
      expect(data.test.script).toBeNull();

      expect(mockDb.values).toHaveBeenCalledWith({
        title: 'Minimal Test',
        description: null,
        priority: 'medium',
        type: 'e2e',
        script: null,
        projectId: 'project-123',
        organizationId: 'org-123',
        createdByUserId: 'user-123',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should return 400 when title is missing', async () => {
      const invalidTestData = {
        description: 'Test without title',
      };

      mockJson.mockResolvedValue(invalidTestData);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Test title is required');
    });

    it('should return 400 when title is empty string', async () => {
      const invalidTestData = {
        title: '',
        description: 'Test with empty title',
      };

      mockJson.mockResolvedValue(invalidTestData);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Test title is required');
    });

    it('should return 403 when user lacks CREATE_TESTS permission', async () => {
      mockHasPermission.mockResolvedValue(false);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions to create tests');
    });

    it('should handle project context errors', async () => {
      mockRequireProjectContext.mockRejectedValue(new Error('No project context') as never);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to create test');
    });

    it('should handle database insertion errors', async () => {
      mockDb.returning.mockRejectedValue(new Error('Database constraint violation') as never);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to create test');
    });

    it('should handle invalid JSON in request body', async () => {
      mockJson.mockRejectedValue(new Error('Invalid JSON') as never);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);

      expect(response.status).toBe(500);
    });

    it('should handle permission context build errors', async () => {
      mockBuildPermissionContext.mockRejectedValue(new Error('Permission context failed') as never);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to create test');
    });

    it('should include development error details in dev environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });
      
      const testError = new Error('Detailed database error');
      mockDb.returning.mockRejectedValue(testError as never);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create test');
      expect(data.details).toBe('Detailed database error');

      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true });
    });

    it('should handle extra fields in request body gracefully', async () => {
      const testDataWithExtra = {
        ...validTestData,
        extraField: 'should be ignored',
        anotherExtra: 123,
      };

      mockJson.mockResolvedValue(testDataWithExtra);

      const mockRequest = { json: mockJson };
      const response = await POST(mockRequest as unknown as NextRequest);

      expect(response.status).toBe(201);
      
      // Extra fields should not be passed to database
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.not.objectContaining({
          extraField: 'should be ignored',
          anotherExtra: 123,
        })
      );
    });
  });

  describe('base64 script decoding', () => {
    beforeEach(() => {
      mockDb.where.mockResolvedValue([]);
    });

    it('should decode valid base64 scripts', async () => {
      const testsWithBase64 = [
        {
          ...mockTests[0],
          script: 'dGVzdCgibG9naW4iLCAoKSA9PiB7fSk=', // "test("login", () => {})"
        },
      ];
      mockDb.orderBy.mockResolvedValue(testsWithBase64);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data[0].script).toBe('test("login", () => {})');
    });

    it('should return non-base64 scripts as-is', async () => {
      const testsWithPlainScript = [
        {
          ...mockTests[0],
          script: 'test("plain script", () => {})',
        },
      ];
      mockDb.orderBy.mockResolvedValue(testsWithPlainScript);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data[0].script).toBe('test("plain script", () => {})');
    });

    it('should handle base64 decoding errors gracefully', async () => {
      const testsWithInvalidBase64 = [
        {
          ...mockTests[0],
          script: 'VGhpcyBpcyBpbnZhbGlkIGJhc2U2NA==invalid', // corrupted base64
        },
      ];
      mockDb.orderBy.mockResolvedValue(testsWithInvalidBase64);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should fallback to original string on decode error
      expect(data[0].script).toBe('VGhpcyBpcyBpbnZhbGlkIGJhc2U2NA==invalid');
    });
  });
});