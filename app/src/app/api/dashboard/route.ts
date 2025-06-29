import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { monitors, monitorResults, jobs, runs, tests } from "@/db/schema/schema";
import { eq, desc, gte, and, count, sql } from "drizzle-orm";
import { subDays, subHours } from "date-fns";
import { getQueueStats } from "@/lib/queue-stats";

export async function GET() {
  try {
    const dbInstance = db;
    const now = new Date();
    const last24Hours = subHours(now, 24);
    const last7Days = subDays(now, 7);

    // Get queue statistics
    const queueStats = await getQueueStats();

    // Monitor Statistics
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
      dbInstance.select({ count: count() }).from(monitors),
      
      // Active (enabled) monitors
      dbInstance.select({ count: count() }).from(monitors).where(eq(monitors.enabled, true)),
      
      // Up monitors (based on latest status)
      dbInstance.select({ count: count() }).from(monitors).where(eq(monitors.status, "up")),
      
      // Down monitors
      dbInstance.select({ count: count() }).from(monitors).where(eq(monitors.status, "down")),
      
      // Recent monitor results (last 24h)
      dbInstance.select({ count: count() }).from(monitorResults)
        .where(gte(monitorResults.checkedAt, last24Hours)),
      
      // Monitor count by type
      dbInstance.select({
        type: monitors.type,
        count: count()
      }).from(monitors).groupBy(monitors.type),
      
      // Critical alerts (down monitors)
      dbInstance.select({
        id: monitors.id,
        name: monitors.name,
        type: monitors.type,
        status: monitors.status,
        lastCheckAt: monitors.lastCheckAt
      }).from(monitors).where(eq(monitors.status, "down")).limit(5)
    ]);

    // Job Statistics
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
      dbInstance.select({ count: count() }).from(jobs),
      
      // Active jobs (not paused)
      dbInstance.select({ count: count() }).from(jobs).where(eq(jobs.status, "running")),
      
      // Recent runs (last 7 days)
      dbInstance.select({ count: count() }).from(runs)
        .where(gte(runs.startedAt, last7Days)),
      
      // Successful runs in last 24h
      dbInstance.select({ count: count() }).from(runs)
        .where(and(
          gte(runs.startedAt, last24Hours),
          eq(runs.status, "passed")
        )),
      
      // Failed runs in last 24h
      dbInstance.select({ count: count() }).from(runs)
        .where(and(
          gte(runs.startedAt, last24Hours),
          eq(runs.status, "failed")
        )),
      
      // Jobs by status
      dbInstance.select({
        status: jobs.status,
        count: count()
      }).from(jobs).groupBy(jobs.status),
      
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
        .orderBy(desc(runs.startedAt))
        .limit(10)
    ]);

    // Test Statistics
    const [
      totalTests,
      testsByType,
      recentTestRuns
    ] = await Promise.all([
      // Total tests
      dbInstance.select({ count: count() }).from(tests),
      
      // Tests by type
      dbInstance.select({
        type: tests.type,
        count: count()
      }).from(tests).groupBy(tests.type),
      
      // Recent test activity (via job runs)
      dbInstance.select({ count: count() }).from(runs)
        .where(gte(runs.startedAt, last7Days))
    ]);

    // Calculate uptime percentage for active monitors
    const uptimeStats = await dbInstance.select({
      monitorId: monitorResults.monitorId,
      isUp: monitorResults.isUp,
      checkedAt: monitorResults.checkedAt
    }).from(monitorResults)
      .where(gte(monitorResults.checkedAt, last24Hours))
      .orderBy(desc(monitorResults.checkedAt));

    // Calculate overall uptime percentage
    const totalChecks = uptimeStats.length;
    const successfulChecks = uptimeStats.filter(r => r.isUp).length;
    const overallUptime = totalChecks > 0 ? (successfulChecks / totalChecks) * 100 : 100;

    // Monitor availability trend (last 7 days)
    const availabilityTrend = await dbInstance.select({
      date: sql<string>`DATE(${monitorResults.checkedAt})`,
      upCount: sql<number>`SUM(CASE WHEN ${monitorResults.isUp} THEN 1 ELSE 0 END)`,
      totalCount: count()
    }).from(monitorResults)
      .where(gte(monitorResults.checkedAt, last7Days))
      .groupBy(sql`DATE(${monitorResults.checkedAt})`)
      .orderBy(sql`DATE(${monitorResults.checkedAt})`);

    // Response time statistics
    const responseTimeStats = await dbInstance.select({
      avgResponseTime: sql<number>`AVG(${monitorResults.responseTimeMs})`,
      minResponseTime: sql<number>`MIN(${monitorResults.responseTimeMs})`,
      maxResponseTime: sql<number>`MAX(${monitorResults.responseTimeMs})`
    }).from(monitorResults)
      .where(and(
        gte(monitorResults.checkedAt, last24Hours),
        eq(monitorResults.isUp, true)
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