import { db } from "@/lib/db";
import { monitors, monitorResults } from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";

export class HeartbeatService {
  /**
   * Check heartbeat monitors for missed pings using an intelligent batching strategy
   * Only checks monitors that are likely to be overdue based on their expected intervals
   */
  static async checkMissedHeartbeats(checkIntervalMinutes: number = 5): Promise<{
    checked: number;
    missedCount: number;
    errors: string[];
    skipped: number;
  }> {
    const errors: string[] = [];
    let checked = 0;
    let missedCount = 0;
    let skipped = 0;

    try {
      const dbInstance = await db();
      const now = new Date();
      
      // Get all enabled heartbeat monitors
      const heartbeatMonitors = await dbInstance
        .select()
        .from(monitors)
        .where(and(
          eq(monitors.type, "heartbeat"),
          eq(monitors.enabled, true)
        ));

      console.log(`[Heartbeat Service] Found ${heartbeatMonitors.length} heartbeat monitors`);

      // Intelligent filtering: only check monitors that could potentially be overdue
      const monitorsToCheck = heartbeatMonitors.filter(monitor => {
        const config = monitor.config as Record<string, unknown>;
        const expectedIntervalMinutes = (config?.expectedIntervalMinutes as number) || 60;
        const gracePeriodMinutes = (config?.gracePeriodMinutes as number) || 10;
        const lastPingAt = config?.lastPingAt as string;

        // If no ping received yet, check if enough time has passed since creation
        if (!lastPingAt) {
          const createdAt = new Date(monitor.createdAt!);
          const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);
          // Only check if we're past the expected interval + grace period
          return minutesSinceCreation >= (expectedIntervalMinutes + gracePeriodMinutes - checkIntervalMinutes);
        }

        // For monitors with pings, check if they're approaching or past the deadline
        const lastPing = new Date(lastPingAt);
        const minutesSinceLastPing = (now.getTime() - lastPing.getTime()) / (1000 * 60);
        const totalWaitTime = expectedIntervalMinutes + gracePeriodMinutes;
        
        // Check monitors that are either overdue or will be overdue within the next check interval
        return minutesSinceLastPing >= (totalWaitTime - checkIntervalMinutes);
      });

      skipped = heartbeatMonitors.length - monitorsToCheck.length;
      console.log(`[Heartbeat Service] Checking ${monitorsToCheck.length} monitors, skipping ${skipped} (not due for check)`);

      for (const monitor of monitorsToCheck) {
        checked++;
        
        try {
          const config = monitor.config as Record<string, unknown>;
          const expectedIntervalMinutes = (config?.expectedIntervalMinutes as number) || 60; // Default 1 hour
          const gracePeriodMinutes = (config?.gracePeriodMinutes as number) || 10; // Default 10 minutes grace
          const lastPingAt = config?.lastPingAt as string;

          // Calculate the deadline for the next ping
          const totalMinutes = expectedIntervalMinutes + gracePeriodMinutes;
          
          let isOverdue = false;
          let overdueMessage = "";

          if (!lastPingAt) {
            // No ping received yet - check if monitor was created more than the expected interval ago
            const createdAt = new Date(monitor.createdAt!);
            const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);
            
            if (minutesSinceCreation > totalMinutes) {
              isOverdue = true;
              overdueMessage = `No initial ping received within ${totalMinutes} minutes of creation`;
            }
          } else {
            // Check if last ping is too old
            const lastPing = new Date(lastPingAt);
            const minutesSinceLastPing = (now.getTime() - lastPing.getTime()) / (1000 * 60);
            
            if (minutesSinceLastPing > totalMinutes) {
              isOverdue = true;
              overdueMessage = `Last ping was ${Math.round(minutesSinceLastPing)} minutes ago, expected every ${expectedIntervalMinutes} minutes (${gracePeriodMinutes}min grace)`;
            }
          }

          if (isOverdue && monitor.status !== "down") {
            // Mark as down and record the missed heartbeat
            await dbInstance
              .update(monitors)
              .set({
                status: "down",
                lastCheckAt: now,
                lastStatusChangeAt: now,
              })
              .where(eq(monitors.id, monitor.id));

            // Record the missed heartbeat with specific error message
            const specificErrorMessage = !lastPingAt 
              ? "No ping within expected interval"
              : "No ping within expected interval";
              
            await dbInstance.insert(monitorResults).values({
              monitorId: monitor.id,
              checkedAt: now,
              status: "timeout",
              responseTimeMs: 0,
              details: {
                errorMessage: specificErrorMessage,
                detailedMessage: overdueMessage,
                expectedInterval: expectedIntervalMinutes,
                gracePeriod: gracePeriodMinutes,
                lastPingAt: lastPingAt || null,
                checkType: "missed_heartbeat",
              },
              isUp: false,
              isStatusChange: true,
            });

            missedCount++;
            console.log(`[Heartbeat Service] Monitor ${monitor.name} (${monitor.id}) marked as down: ${overdueMessage}`);
          }
        } catch (error) {
          const errorMsg = `Failed to check heartbeat monitor ${monitor.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`[Heartbeat Service] ${errorMsg}`);
        }
      }

      console.log(`[Heartbeat Service] Completed check: ${checked} monitors checked, ${missedCount} missed heartbeats detected`);
      
      return {
        checked,
        missedCount,
        errors,
        skipped,
      };
    } catch (error) {
      const errorMsg = `Failed to check missed heartbeats: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error(`[Heartbeat Service] ${errorMsg}`);
      
      return {
        checked,
        missedCount,
        errors,
        skipped,
      };
    }
  }

  /**
   * Generate a unique heartbeat URL token
   */
  static generateHeartbeatToken(): string {
    return crypto.randomUUID();
  }

  /**
   * Get the full heartbeat URL for a token
   */
  static getHeartbeatUrl(token: string, baseUrl?: string): string {
    const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${base}/api/heartbeat/${token}`;
  }

  /**
   * Get the heartbeat failure URL for a token
   */
  static getHeartbeatFailureUrl(token: string, baseUrl?: string): string {
    const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${base}/api/heartbeat/${token}/fail`;
  }
} 