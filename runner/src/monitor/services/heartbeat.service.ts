import { Injectable, Logger } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { eq, and, isNotNull, lte } from 'drizzle-orm';
import { monitors, monitorResults } from '../../db/schema';

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);

  constructor(private readonly dbService: DbService) {}

  async checkMissedHeartbeats(checkIntervalMinutes: number) {
    this.logger.log(
      `Checking for missed heartbeats in the last ${checkIntervalMinutes} minutes.`,
    );
    const results = {
      checked: 0,
      missedCount: 0,
      skipped: 0,
      errors: [],
    };

    const heartbeatMonitors = await this.dbService.db
      .select()
      .from(monitors)
      .where(and(eq(monitors.type, 'heartbeat'), eq(monitors.enabled, true)));

    results.checked = heartbeatMonitors.length;

    for (const monitor of heartbeatMonitors) {
      //...
    }

    return results;
  }
} 