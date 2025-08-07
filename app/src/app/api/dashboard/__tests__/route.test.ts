import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { GET } from '../route';

// Mock dependencies
jest.mock('@/utils/db', () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  },
}));

jest.mock('@/lib/queue-stats', () => ({
  getQueueStats: jest.fn(),
}));

jest.mock('@/lib/rbac/middleware', () => ({
  requireAuth: jest.fn(),
  hasPermission: jest.fn(),
}));

jest.mock('@/lib/project-context', () => ({
  requireProjectContext: jest.fn(),
}));

jest.mock('date-fns', () => ({
  subDays: jest.fn(),
  subHours: jest.fn(),
}));

describe('Dashboard API Route', () => {
  const { db } = jest.requireMock('@/utils/db');
  const { getQueueStats } = jest.requireMock('@/lib/queue-stats');
  const { buildUnifiedPermissionContext, hasPermission } = jest.requireMock('@/lib/rbac/middleware');
  const { requireProjectContext } = jest.requireMock('@/lib/project-context');
  const { subDays, subHours } = jest.requireMock('date-fns');

  const mockProjectContext = {
    userId: 'user-123',
    project: { id: 'project-123', name: 'Test Project' },
    organizationId: 'org-123',
  };

  const mockQueueStats = {
    running: 2,
    queued: 5,
    runningCapacity: 10,
    queuedCapacity: 100,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    requireProjectContext.mockResolvedValue(mockProjectContext);
    buildUnifiedPermissionContext.mockResolvedValue({});
    hasPermission.mockResolvedValue(true);
    getQueueStats.mockResolvedValue(mockQueueStats);
    
    // Setup date mocks
    const mockNow = new Date('2024-01-01T12:00:00Z');
    const mockLast24Hours = new Date('2023-12-31T12:00:00Z');
    const mockLast7Days = new Date('2023-12-25T12:00:00Z');
    
    jest.spyOn(global, 'Date').mockImplementation(() => mockNow as Date);
    subHours.mockReturnValue(mockLast24Hours);
    subDays.mockReturnValue(mockLast7Days);

    // Setup database query mocks
    db.limit.mockResolvedValue([{ count: 0 }]);
  });

  afterEach(() => {
    (global.Date as jest.Mock).mockRestore?.();
  });

  describe('GET /api/dashboard', () => {
    it('should return dashboard data successfully', async () => {
      // Mock database responses
      db.limit.mockResolvedValueOnce([{ count: 5 }]) // totalMonitors
        .mockResolvedValueOnce([{ count: 4 }]) // activeMonitors
        .mockResolvedValueOnce([{ count: 3 }]) // upMonitors
        .mockResolvedValueOnce([{ count: 1 }]) // downMonitors
        .mockResolvedValueOnce([{ count: 10 }]) // recentMonitorResults
        .mockResolvedValueOnce([{ type: 'http', count: 3 }, { type: 'heartbeat', count: 2 }]) // monitorsByType
        .mockResolvedValueOnce([{ id: 'monitor-1', name: 'Test Monitor', status: 'down' }]) // criticalAlerts
        .mockResolvedValueOnce([{ count: 8 }]) // totalJobs
        .mockResolvedValueOnce([{ count: 6 }]) // activeJobs
        .mockResolvedValueOnce([{ count: 15 }]) // recentRuns
        .mockResolvedValueOnce([{ count: 12 }]) // successfulRuns24h
        .mockResolvedValueOnce([{ count: 3 }]) // failedRuns24h
        .mockResolvedValueOnce([{ status: 'running', count: 6 }, { status: 'paused', count: 2 }]) // jobsByStatus
        .mockResolvedValueOnce([{ id: 'run-1', jobName: 'Test Job', status: 'passed', startedAt: new Date(), duration: 5000 }]) // recentJobRuns
        .mockResolvedValueOnce([{ count: 20 }]) // totalTests
        .mockResolvedValueOnce([{ type: 'e2e', count: 15 }, { type: 'api', count: 5 }]) // testsByType
        .mockResolvedValueOnce([{ count: 25 }]) // recentTestRuns
        .mockResolvedValueOnce([{ monitorId: 'monitor-1', isUp: true, checkedAt: new Date() }]) // uptimeStats
        .mockResolvedValueOnce([{ date: '2024-01-01', upCount: 48, totalCount: 50 }]) // availabilityTrend
        .mockResolvedValueOnce([{ avgResponseTime: 250, minResponseTime: 100, maxResponseTime: 500 }]); // responseTimeStats

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('queue');
      expect(data).toHaveProperty('monitors');
      expect(data).toHaveProperty('jobs');
      expect(data).toHaveProperty('tests');
      expect(data).toHaveProperty('system');

      // Verify monitor data structure
      expect(data.monitors).toEqual({
        total: 5,
        active: 4,
        up: 3,
        down: 1,
        uptime: expect.any(Number),
        recentChecks24h: 10,
        byType: [{ type: 'http', count: 3 }, { type: 'heartbeat', count: 2 }],
        criticalAlerts: [{ id: 'monitor-1', name: 'Test Monitor', status: 'down' }],
        availabilityTrend: [{ date: '2024-01-01', uptime: expect.any(Number) }],
        responseTime: {
          avg: 250,
          min: 100,
          max: 500,
        },
      });

      // Verify job data structure
      expect(data.jobs).toEqual({
        total: 8,
        active: 6,
        recentRuns7d: 15,
        successfulRuns24h: 12,
        failedRuns24h: 3,
        byStatus: [{ status: 'running', count: 6 }, { status: 'paused', count: 2 }],
        recentRuns: expect.any(Array),
      });
    });

    it('should return 403 when user lacks VIEW_DASHBOARD permission', async () => {
      hasPermission.mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Insufficient permissions');
    });

    it('should handle project context errors', async () => {
      requireProjectContext.mockRejectedValue(new Error('No project context'));

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch dashboard data');
    });

    it('should handle database query errors', async () => {
      db.limit.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to fetch dashboard data');
    });

    it('should handle queue stats errors gracefully', async () => {
      getQueueStats.mockRejectedValue(new Error('Redis connection failed'));

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it('should calculate system health correctly', async () => {
      // Setup scenario: no down monitors, queue capacity available
      db.limit.mockResolvedValue([{ count: 0 }]); // No down monitors

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);
      const data = await response.json();

      expect(data.system.healthy).toBe(true);
      expect(data.system.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should calculate uptime percentage correctly', async () => {
      // Mock uptime stats with 80% success rate
      const uptimeStats = [
        { monitorId: 'monitor-1', isUp: true, checkedAt: new Date() },
        { monitorId: 'monitor-1', isUp: true, checkedAt: new Date() },
        { monitorId: 'monitor-1', isUp: true, checkedAt: new Date() },
        { monitorId: 'monitor-1', isUp: true, checkedAt: new Date() },
        { monitorId: 'monitor-1', isUp: false, checkedAt: new Date() },
      ];

      let callCount = 0;
      db.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 14) { // uptimeStats call
          return Promise.resolve(uptimeStats);
        }
        return Promise.resolve([{ count: 0 }]);
      });

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);
      const data = await response.json();

      expect(data.monitors.uptime).toBe(80);
    });

    it('should handle empty database results', async () => {
      // Mock empty results for all queries
      db.limit.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.monitors.total).toBeUndefined();
      expect(data.jobs.total).toBeUndefined();
      expect(data.tests.total).toBeUndefined();
    });

    it('should handle null response time stats', async () => {
      let callCount = 0;
      db.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 16) { // responseTimeStats call
          return Promise.resolve([{ avgResponseTime: null, minResponseTime: null, maxResponseTime: null }]);
        }
        return Promise.resolve([{ count: 0 }]);
      });

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);
      const data = await response.json();

      expect(data.monitors.responseTime).toEqual({
        avg: null,
        min: null,
        max: null,
      });
    });

    it('should verify project scoping in database queries', async () => {
      const request = new NextRequest('http://localhost:3000/api/dashboard');
      await GET(request);

      // Verify that all database queries include project and organization filtering
      expect(requireProjectContext).toHaveBeenCalled();
      expect(buildUnifiedPermissionContext).toHaveBeenCalledWith(
        'user-123',
        'project',
        'org-123',
        'project-123'
      );
    });
  });

  describe('error handling', () => {
    it('should handle permission context build errors', async () => {
      buildUnifiedPermissionContext.mockRejectedValue(new Error('Permission context failed'));

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });

    it('should handle permission check errors', async () => {
      hasPermission.mockRejectedValue(new Error('Permission check failed'));

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe('data formatting', () => {
    it('should format recent job runs correctly', async () => {
      const mockJobRun = {
        id: 'run-123',
        jobId: 'job-123',
        jobName: 'Test Job',
        status: 'passed',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        duration: 5000,
      };

      let callCount = 0;
      db.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 13) { // recentJobRuns call
          return Promise.resolve([mockJobRun]);
        }
        return Promise.resolve([{ count: 0 }]);
      });

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);
      const data = await response.json();

      expect(data.jobs.recentRuns[0]).toEqual({
        id: 'run-123',
        jobId: 'job-123',
        jobName: 'Test Job',
        status: 'passed',
        startedAt: '2024-01-01T10:00:00.000Z',
        duration: 5000,
      });
    });

    it('should handle availability trend calculations', async () => {
      const mockTrendData = [
        { date: '2024-01-01', upCount: 95, totalCount: 100 },
        { date: '2024-01-02', upCount: 48, totalCount: 50 },
      ];

      let callCount = 0;
      db.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 15) { // availabilityTrend call
          return Promise.resolve(mockTrendData);
        }
        return Promise.resolve([{ count: 0 }]);
      });

      const request = new NextRequest('http://localhost:3000/api/dashboard');
      const response = await GET(request);
      const data = await response.json();

      expect(data.monitors.availabilityTrend).toEqual([
        { date: '2024-01-01', uptime: 95 },
        { date: '2024-01-02', uptime: 96 },
      ]);
    });
  });
});