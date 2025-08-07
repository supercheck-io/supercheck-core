import { NextResponse } from "next/server";
import { db } from "@/utils/db";
import { monitors, monitorResults, jobs, runs, tests } from "@/db/schema/schema";
import { eq, desc, gte, and, count, sql } from "drizzle-orm";
import { subDays, subHours } from "date-fns";
import { getQueueStats } from "@/lib/queue-stats";
import { hasPermission } from '@/lib/rbac/middleware';
import { requireProjectContext } from '@/lib/project-context';

export async function GET() {
  try {
    const { project, organizationId } = await requireProjectContext();
    
    // Use current project context - no need for query params
    const targetProjectId = project.id;
    
    // Build permission context and check access
    const canView = await hasPermission('project', 'view', { organizationId, projectId: targetProjectId });
    
    if (!canView) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const dbInstance = db;
    const now = new Date();
    const last24Hours = subHours(now, 24);
    const last7Days = subDays(now, 7);

    // Get queue statistics
    const queueStats = await getQueueStats();

    // Monitor Statistics - scoped to project
    const [
      totalMonitors,
      activeMonitors,
      upMonitors,
      downMonitors,
      recentMonitorResults,
      monitorsByType,
      criticalAlerts
    ] = await Promise.all([
      // Total monitors
      dbInstance.select({ count: count() }).from(monitors)
        .where(and(eq(monitors.projectId, targetProjectId), eq(monitors.organizationId, organizationId))),
      
      // Active (enabled) monitors
      dbInstance.select({ count: count() }).from(monitors)
        .where(and(eq(monitors.enabled, true), eq(monitors.projectId, targetProjectId), eq(monitors.organizationId, organizationId))),
      
      // Up monitors (based on latest status)
      dbInstance.select({ count: count() }).from(monitors)
        .where(and(eq(monitors.status, "up"), eq(monitors.projectId, targetProjectId), eq(monitors.organizationId, organizationId))),
      
      // Down monitors
      dbInstance.select({ count: count() }).from(monitors)
        .where(and(eq(monitors.status, "down"), eq(monitors.projectId, targetProjectId), eq(monitors.organizationId, organizationId))),
      
      // Recent monitor results (last 24h) - only for monitors in this project
      dbInstance.select({ count: count() })
        .from(monitorResults)
        .innerJoin(monitors, eq(monitorResults.monitorId, monitors.id))
        .where(and(
          gte(monitorResults.checkedAt, last24Hours),
          eq(monitors.projectId, targetProjectId),
          eq(monitors.organizationId, organizationId)
        )),
      
      // Monitor count by type
      dbInstance.select({
        type: monitors.type,
        count: count()
      }).from(monitors)
        .where(and(eq(monitors.projectId, targetProjectId), eq(monitors.organizationId, organizationId)))
        .groupBy(monitors.type),
      
      // Critical alerts (down monitors)
      dbInstance.select({
        id: monitors.id,
        name: monitors.name,
        type: monitors.type,
        status: monitors.status,
        lastCheckAt: monitors.lastCheckAt
      }).from(monitors)
        .where(and(eq(monitors.status, "down"), eq(monitors.projectId, targetProjectId), eq(monitors.organizationId, organizationId)))
        .limit(5)
    ]);

    // Job Statistics - scoped to project
    const [
      totalJobs,
      activeJobs,
      recentRuns,
      successfulRuns24h,
      failedRuns24h,
      jobsByStatus,
      recentJobRuns
    ] = await Promise.all([
      // Total jobs
      dbInstance.select({ count: count() }).from(jobs)
        .where(and(eq(jobs.projectId, targetProjectId), eq(jobs.organizationId, organizationId))),
      
      // Active jobs (not paused)
      dbInstance.select({ count: count() }).from(jobs)
        .where(and(eq(jobs.status, "running"), eq(jobs.projectId, targetProjectId), eq(jobs.organizationId, organizationId))),
      
      // Recent runs (last 7 days) - only for jobs in this project
      dbInstance.select({ count: count() })
        .from(runs)
        .innerJoin(jobs, eq(runs.jobId, jobs.id))
        .where(and(
          gte(runs.startedAt, last7Days),
          eq(jobs.projectId, targetProjectId),
          eq(jobs.organizationId, organizationId)
        )),
      
      // Successful runs in last 24h
      dbInstance.select({ count: count() })
        .from(runs)
        .innerJoin(jobs, eq(runs.jobId, jobs.id))
        .where(and(
          gte(runs.startedAt, last24Hours),
          eq(runs.status, "passed"),
          eq(jobs.projectId, targetProjectId),
          eq(jobs.organizationId, organizationId)
        )),
      
      // Failed runs in last 24h
      dbInstance.select({ count: count() })
        .from(runs)
        .innerJoin(jobs, eq(runs.jobId, jobs.id))
        .where(and(
          gte(runs.startedAt, last24Hours),
          eq(runs.status, "failed"),
          eq(jobs.projectId, targetProjectId),
          eq(jobs.organizationId, organizationId)
        )),
      
      // Jobs by status
      dbInstance.select({
        status: jobs.status,
        count: count()
      }).from(jobs)
        .where(and(eq(jobs.projectId, targetProjectId), eq(jobs.organizationId, organizationId)))
        .groupBy(jobs.status),
      
      // Recent job runs with details
      dbInstance.select({
        id: runs.id,
        jobId: runs.jobId,
        jobName: jobs.name,
        status: runs.status,
        startedAt: runs.startedAt,
        duration: runs.duration
      }).from(runs)
        .leftJoin(jobs, eq(runs.jobId, jobs.id))
        .where(and(eq(jobs.projectId, targetProjectId), eq(jobs.organizationId, organizationId)))
        .orderBy(desc(runs.startedAt))
        .limit(10)
    ]);

    // Test Statistics - scoped to project
    const [
      totalTests,
      testsByType,
      recentTestRuns
    ] = await Promise.all([
      // Total tests
      dbInstance.select({ count: count() }).from(tests)
        .where(and(eq(tests.projectId, targetProjectId), eq(tests.organizationId, organizationId))),
      
      // Tests by type
      dbInstance.select({
        type: tests.type,
        count: count()
      }).from(tests)
        .where(and(eq(tests.projectId, targetProjectId), eq(tests.organizationId, organizationId)))
        .groupBy(tests.type),
      
      // Recent test activity (via job runs) - only for jobs in this project
      dbInstance.select({ count: count() })
        .from(runs)
        .innerJoin(jobs, eq(runs.jobId, jobs.id))
        .where(and(
          gte(runs.startedAt, last7Days),
          eq(jobs.projectId, targetProjectId),
          eq(jobs.organizationId, organizationId)
        ))
    ]);

    // Calculate uptime percentage for active monitors in this project
    const uptimeStats = await dbInstance.select({
      monitorId: monitorResults.monitorId,
      isUp: monitorResults.isUp,
      checkedAt: monitorResults.checkedAt
    }).from(monitorResults)
      .innerJoin(monitors, eq(monitorResults.monitorId, monitors.id))
      .where(and(
        gte(monitorResults.checkedAt, last24Hours),
        eq(monitors.projectId, targetProjectId),
        eq(monitors.organizationId, organizationId)
      ))
      .orderBy(desc(monitorResults.checkedAt));

    // Calculate overall uptime percentage
    const totalChecks = uptimeStats.length;
    const successfulChecks = uptimeStats.filter(r => r.isUp).length;
    const overallUptime = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100;

    // Monitor availability trend (last 7 days) - only for monitors in this project
    const availabilityTrend = await dbInstance.select({
      date: sql<string>`DATE(${monitorResults.checkedAt})`,
      upCount: sql<number>`SUM(CASE WHEN ${monitorResults.isUp} THEN 1 ELSE 0 END)`,
      totalCount: count()
    }).from(monitorResults)
      .innerJoin(monitors, eq(monitorResults.monitorId, monitors.id))
      .where(and(
        gte(monitorResults.checkedAt, last7Days),
        eq(monitors.projectId, targetProjectId),
        eq(monitors.organizationId, organizationId)
      ))
      .groupBy(sql`DATE(${monitorResults.checkedAt})`)
      .orderBy(sql`DATE(${monitorResults.checkedAt})`);

    // Response time statistics - only for monitors in this project
    const responseTimeStats = await dbInstance.select({
      avgResponseTime: sql<number>`AVG(${monitorResults.responseTimeMs})`,
      minResponseTime: sql<number>`MIN(${monitorResults.responseTimeMs})`,
      maxResponseTime: sql<number>`MAX(${monitorResults.responseTimeMs})`
    }).from(monitorResults)
      .innerJoin(monitors, eq(monitorResults.monitorId, monitors.id))
      .where(and(
        gte(monitorResults.checkedAt, last24Hours),
        eq(monitorResults.isUp, true),
        eq(monitors.projectId, targetProjectId),
        eq(monitors.organizationId, organizationId)
      ));

    return NextResponse.json({
      // Queue Statistics
      queue: queueStats,
      
      // Monitor Statistics
      monitors: {
        total: totalMonitors[0].count,
        active: activeMonitors[0].count,
        up: upMonitors[0].count,
        down: downMonitors[0].count,
        uptime: Math.round(overallUptime * 100) / 100,
        recentChecks24h: recentMonitorResults[0].count,
        byType: monitorsByType,
        criticalAlerts: criticalAlerts,
        availabilityTrend: availabilityTrend.map(day => ({
          date: day.date,
          uptime: day.totalCount > 0 ? Math.round((day.upCount / day.totalCount) * 100 * 100) / 100 : 100
        })),
        responseTime: {
          avg: responseTimeStats[0]?.avgResponseTime ? Math.round(responseTimeStats[0].avgResponseTime) : null,
          min: responseTimeStats[0]?.minResponseTime || null,
          max: responseTimeStats[0]?.maxResponseTime || null
        }
      },
      
      // Job Statistics
      jobs: {
        total: totalJobs[0].count,
        active: activeJobs[0].count,
        recentRuns7d: recentRuns[0].count,
        successfulRuns24h: successfulRuns24h[0].count,
        failedRuns24h: failedRuns24h[0].count,
        byStatus: jobsByStatus,
        recentRuns: recentJobRuns.map(run => ({
          id: run.id,
          jobId: run.jobId,
          jobName: run.jobName,
          status: run.status,
          startedAt: run.startedAt?.toISOString(),
          duration: run.duration
        }))
      },
      
      // Test Statistics
      tests: {
        total: totalTests[0].count,
        byType: testsByType,
        recentActivity7d: recentTestRuns[0].count
      },
      
      // System Health
      system: {
        timestamp: now.toISOString(),
        healthy: downMonitors[0].count === 0 && queueStats.running < queueStats.runningCapacity
      }
    });

  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
} 