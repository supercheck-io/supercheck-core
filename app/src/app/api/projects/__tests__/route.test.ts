import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

// Mock dependencies
jest.mock('@/lib/rbac/middleware', () => ({
  requireAuth: jest.fn(),
  hasPermission: jest.fn(),
}));

jest.mock('@/lib/session', () => ({
  getActiveOrganization: jest.fn(),
  getUserProjects: jest.fn(),
}));

jest.mock('@/lib/project-context', () => ({
  getCurrentProjectContext: jest.fn(),
}));

jest.mock('@/utils/db', () => ({
  db: {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn(),
  },
}));

jest.mock('@/lib/audit-logger', () => ({
  logAuditEvent: jest.fn(),
}));

describe('Projects API Route', () => {
  const { requireAuth, hasPermission } = jest.requireMock('@/lib/rbac/middleware');
  const { getActiveOrganization, getUserProjects } = jest.requireMock('@/lib/session');
  const { getCurrentProjectContext } = jest.requireMock('@/lib/project-context');
  const { db } = jest.requireMock('@/utils/db');
  const { logAuditEvent } = jest.requireMock('@/lib/audit-logger');

  const mockUser = { userId: 'user-123' };
  const mockOrganization = { id: 'org-123', name: 'Test Org' };
  const mockProjects = [
    { id: 'project-1', name: 'Project 1', organizationId: 'org-123' },
    { id: 'project-2', name: 'Project 2', organizationId: 'org-123' },
  ];
  const mockCurrentProject = { id: 'project-1', name: 'Project 1' };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful auth and permissions
    requireAuth.mockResolvedValue(mockUser);
    buildUnifiedPermissionContext.mockResolvedValue({});
    hasPermission.mockResolvedValue(true);
    getActiveOrganization.mockResolvedValue(mockOrganization);
    getUserProjects.mockResolvedValue(mockProjects);
    getCurrentProjectContext.mockResolvedValue(mockCurrentProject);
    logAuditEvent.mockResolvedValue(undefined);
  });

  describe('GET /api/projects', () => {
    it('should return projects successfully with active organization', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        data: mockProjects,
        currentProject: mockCurrentProject,
      });

      expect(requireAuth).toHaveBeenCalled();
      expect(getActiveOrganization).toHaveBeenCalled();
      expect(getUserProjects).toHaveBeenCalledWith('user-123', 'org-123');
      expect(getCurrentProjectContext).toHaveBeenCalled();
    });

    it('should return projects with specified organizationId query param', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects?organizationId=org-456');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(getUserProjects).toHaveBeenCalledWith('user-123', 'org-456');
      expect(buildUnifiedPermissionContext).toHaveBeenCalledWith('user-123', 'organization', 'org-456');
    });

    it('should return 400 when no active organization found', async () => {
      getActiveOrganization.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('No active organization found');
    });

    it('should return 401 when authentication fails', async () => {
      requireAuth.mockRejectedValue(new Error('Authentication required'));

      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should return 403 when user lacks VIEW_ALL_PROJECTS permission', async () => {
      hasPermission.mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
    });

    it('should return 404 when organization not found', async () => {
      getUserProjects.mockRejectedValue(new Error('Organization not found'));

      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Organization not found or access denied');
    });

    it('should handle unexpected errors', async () => {
      getUserProjects.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch projects');
    });

    it('should handle missing current project context', async () => {
      getCurrentProjectContext.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.currentProject).toBeNull();
    });
  });

  describe('POST /api/projects', () => {
    const validProjectData = {
      name: 'New Project',
      slug: 'new-project',
      description: 'A new test project',
      organizationId: 'org-123',
    };

    const mockNewProject = {
      id: 'project-new',
      name: 'New Project',
      slug: 'new-project',
      description: 'A new test project',
      organizationId: 'org-123',
      isDefault: false,
      status: 'active',
      createdAt: new Date('2024-01-01T12:00:00Z'),
    };

    beforeEach(() => {
      db.returning.mockResolvedValue([mockNewProject]);
      // Mock environment variable
      process.env.MAX_PROJECTS_PER_ORG = '10';
    });

    it('should create project successfully', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(validProjectData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data).toEqual({
        id: 'project-new',
        name: 'New Project',
        slug: 'new-project',
        description: 'A new test project',
        organizationId: 'org-123',
        isDefault: false,
        status: 'active',
        createdAt: mockNewProject.createdAt,
        role: 'org_owner',
      });

      expect(db.insert).toHaveBeenCalledTimes(2); // project and projectMember
      expect(logAuditEvent).toHaveBeenCalledWith({
        userId: 'user-123',
        organizationId: 'org-123',
        action: 'project_created',
        resource: 'project',
        resourceId: 'project-new',
        metadata: expect.objectContaining({
          projectName: 'New Project',
          projectSlug: 'new-project',
          userRole: 'org_owner',
        }),
        success: true,
      });
    });

    it('should create project without optional fields', async () => {
      const minimalProjectData = {
        name: 'Minimal Project',
      };

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(minimalProjectData),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      expect(db.values).toHaveBeenCalledWith({
        organizationId: 'org-123', // from active organization
        name: 'Minimal Project',
        slug: null,
        description: null,
        isDefault: false,
        status: 'active',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('should return 400 when project name is missing', async () => {
      const invalidData = {
        description: 'Project without name',
      };

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(invalidData),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Project name is required');
    });

    it('should return 400 when no active organization found', async () => {
      getActiveOrganization.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Project' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('No active organization found');
    });

    it('should return 403 when user lacks CREATE_PROJECTS permission', async () => {
      hasPermission.mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(validProjectData),
      });

      const response = await POST(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions to create projects');
    });

    it('should return 400 when project limit is exceeded', async () => {
      // Mock 10 existing projects (max limit)
      const maxProjects = Array.from({ length: 10 }, (_, i) => ({
        id: `project-${i}`,
        name: `Project ${i}`,
      }));
      getUserProjects.mockResolvedValue(maxProjects);

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(validProjectData),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Maximum 10 projects allowed per organization');
    });

    it('should handle custom project limit from environment', async () => {
      process.env.MAX_PROJECTS_PER_ORG = '5';
      const maxProjects = Array.from({ length: 5 }, (_, i) => ({
        id: `project-${i}`,
        name: `Project ${i}`,
      }));
      getUserProjects.mockResolvedValue(maxProjects);

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(validProjectData),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Maximum 5 projects allowed per organization');
    });

    it('should return 401 when authentication fails', async () => {
      requireAuth.mockRejectedValue(new Error('Authentication required'));

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(validProjectData),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authentication required');
    });

    it('should handle database errors during project creation', async () => {
      db.returning.mockRejectedValue(new Error('Database constraint violation'));

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(validProjectData),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to create project');
    });

    it('should handle invalid JSON in request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: 'invalid json',
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
    });

    it('should handle audit logging errors gracefully', async () => {
      logAuditEvent.mockRejectedValue(new Error('Audit logging failed'));

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(validProjectData),
      });

      // Should still succeed even if audit logging fails
      const response = await POST(request);

      expect(response.status).toBe(201);
    });

    it('should use specified organizationId from request body', async () => {
      const projectDataWithOrgId = {
        ...validProjectData,
        organizationId: 'org-456',
      };

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify(projectDataWithOrgId),
      });

      await POST(request);

      expect(buildUnifiedPermissionContext).toHaveBeenCalledWith('user-123', 'organization', 'org-456');
      expect(getUserProjects).toHaveBeenCalledWith('user-123', 'org-456');
    });
  });

  describe('error handling edge cases', () => {
    it('should handle non-Error exceptions in GET', async () => {
      getUserProjects.mockRejectedValue('String error');

      const request = new NextRequest('http://localhost:3000/api/projects');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch projects');
    });

    it('should handle non-Error exceptions in POST', async () => {
      db.returning.mockRejectedValue('Database error string');

      const request = new NextRequest('http://localhost:3000/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Project' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to create project');
    });
  });
});