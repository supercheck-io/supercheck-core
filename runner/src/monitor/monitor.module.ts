import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MonitorService } from './monitor.service';
import { MonitorProcessor } from './monitor.processor';
import { MONITOR_QUEUE } from './monitor.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: MONITOR_QUEUE, // Worker queue for receiving execution jobs
      },
    ),
  ],
  providers: [MonitorService, MonitorProcessor],
  exports: [MonitorService, BullModule], // Export BullModule if injecting queue in service/processor
})
export class MonitorModule {} 