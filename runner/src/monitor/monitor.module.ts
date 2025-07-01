import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HttpModule } from '@nestjs/axios';
import { MonitorService } from './monitor.service';
import { MonitorProcessor } from './monitor.processor';
import { MONITOR_EXECUTION_QUEUE } from './monitor.constants';
import { DbModule } from '../db/db.module';
import { HeartbeatService } from './services/heartbeat.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: MONITOR_EXECUTION_QUEUE,
    }),
    HttpModule,
    DbModule,
    NotificationModule,
  ],
  providers: [MonitorService, MonitorProcessor, HeartbeatService],
  exports: [MonitorService, HeartbeatService],
})
export class MonitorModule {} 