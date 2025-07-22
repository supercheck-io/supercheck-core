import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { MonitorService } from './monitor.service';
import { MonitorProcessor } from './monitor.processor';
import { MONITOR_EXECUTION_QUEUE, HEARTBEAT_PING_NOTIFICATION_QUEUE } from './monitor.constants';
import { DbModule } from '../db/db.module';
import { NotificationModule } from '../notification/notification.module';
import { MonitorAlertService } from './services/monitor-alert.service';
import { HeartbeatPingNotificationProcessor } from './processors/heartbeat-ping-notification.processor';

@Module({
  imports: [
    BullModule.registerQueue(
        { name: MONITOR_EXECUTION_QUEUE },
        { name: HEARTBEAT_PING_NOTIFICATION_QUEUE }
    ),
    HttpModule,
    DbModule,
    NotificationModule,
  ],
  providers: [
    MonitorService,
    MonitorProcessor,
    MonitorAlertService,
    HeartbeatPingNotificationProcessor,
  ],
  exports: [MonitorService],
})
export class MonitorModule {} 