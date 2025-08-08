import { Injectable, Logger } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { JOB_EXECUTION_QUEUE, TEST_EXECUTION_QUEUE } from '../constants';
import { DbService } from './db.service';

/**
 * Queue Status Service - Centralized Bull Queue Status Management
 *
 * This service manages status updates directly through Bull queues rather than
 * separate Redis pub/sub channels. This simplifies the architecture by:
 *
 * 1. Using Bull's built-in event system for status tracking
 * 2. Leveraging Bull's existing Redis data with proper TTL settings
 * 3. Removing the need for separate Redis pub/sub channels
 *
 * NOTE: Database status updates are handled by the job execution processor
 * to avoid race conditions. This service only provides logging and monitoring.
 */
@Injectable()
export class QueueStatusService {
  private readonly logger = new Logger(QueueStatusService.name);
  private jobQueueEvents: QueueEvents;
  private testQueueEvents: QueueEvents;

  constructor(
    @InjectQueue(JOB_EXECUTION_QUEUE) private jobQueue: Queue,
    @InjectQueue(TEST_EXECUTION_QUEUE) private testQueue: Queue,
    private dbService: DbService,
  ) {
    this.initializeQueueListeners();
  }

  /**
   * Sets up listeners for Bull queue events for logging and monitoring
   * Database updates are handled by the job execution processor to avoid race conditions
   */
  private initializeQueueListeners() {
    // Set up QueueEvents for job queue
    this.jobQueueEvents = new QueueEvents(JOB_EXECUTION_QUEUE, {
      connection: this.jobQueue.opts.connection,
    });

    // Set up QueueEvents for test queue
    this.testQueueEvents = new QueueEvents(TEST_EXECUTION_QUEUE, {
      connection: this.testQueue.opts.connection,
    });

    // Job queue event listeners - only for logging and monitoring
    this.jobQueueEvents.on('waiting', ({ jobId }) => {
      this.logger.debug(`Job ${jobId} is waiting`);
    });

    this.jobQueueEvents.on('active', ({ jobId }) => {
      this.logger.debug(`Job ${jobId} is active`);
      // Database updates are handled by the job execution processor
    });

    this.jobQueueEvents.on('completed', ({ jobId }) => {
      this.logger.debug(`Job ${jobId} completed`);
      // Database updates are handled by the job execution processor
    });

    this.jobQueueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.error(`Job ${jobId} failed: ${failedReason}`);
      // Database updates are handled by the job execution processor
    });

    // Test queue event listeners - only for logging and monitoring
    this.testQueueEvents.on('waiting', ({ jobId }) => {
      this.logger.debug(`Test ${jobId} is waiting`);
    });

    this.testQueueEvents.on('active', ({ jobId }) => {
      this.logger.debug(`Test ${jobId} is active`);
    });

    this.testQueueEvents.on('completed', ({ jobId }) => {
      this.logger.debug(`Test ${jobId} completed`);
    });

    this.testQueueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.error(`Test ${jobId} failed: ${failedReason}`);
    });
  }
}
