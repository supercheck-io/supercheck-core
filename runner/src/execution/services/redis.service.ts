import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

// Constants for Redis TTL
const REDIS_CHANNEL_TTL = 60 * 60; // 1 hour in seconds

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.logger.log(`Initializing Redis connection to ${host}:${port}`);
    
    this.redisClient = new Redis({
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: null,
    });

    this.redisClient.on('error', (err) => this.logger.error('Redis Error:', err));
    this.redisClient.on('connect', () => this.logger.log('Redis Connected'));
    this.redisClient.on('ready', () => this.logger.log('Redis Ready'));
  }

  async onModuleInit() {
    try {
      await this.redisClient.ping();
      this.logger.log('Redis connection successful');
    } catch (error) {
      this.logger.error('Redis connection failed:', error);
    }
  }

  /**
   * Publish a test status update
   * @param testId The ID of the test
   * @param data The status data to publish
   */
  async publishTestStatus(testId: string, data: any): Promise<void> {
    const channelName = `test-status:${testId}`;
    this.logger.debug(`Publishing test status update to ${channelName}:`, data);
    
    try {
      // Publish the status update
      await this.redisClient.publish(channelName, JSON.stringify(data));
      
      // Set TTL for this test status key to prevent Redis from growing too large
      await this.redisClient.set(`test-status-ttl:${testId}`, "active", "EX", REDIS_CHANNEL_TTL);
      
      // If this is a terminal status, set a shorter TTL
      if (data.status === 'completed' || data.status === 'failed') {
        // For terminal statuses, we'll keep the data for a shorter time since it's already recorded in the database
        await this.redisClient.set(`test-status-ttl:${testId}`, "completed", "EX", 60 * 15); // 15 minutes
        this.logger.debug(`Set shorter TTL for completed test ${testId}: 15 minutes`);
      }
      
      this.logger.debug(`Status update published for test ${testId}`);
    } catch (error) {
      this.logger.error(`Failed to publish status update for test ${testId}:`, error);
    }
  }

  /**
   * Publish a job status update
   * @param entityId The ID of the entity (job/run)
   * @param data The status data to publish
   */
  async publishJobStatus(entityId: string, data: any): Promise<void> {
    const channelName = `job-status:${entityId}`;
    this.logger.debug(`Publishing job status update to ${channelName}:`, data);
    
    try {
      // Ensure runId is in the data
      if (!data.runId && entityId) {
        data.runId = entityId;
      }
      
      // Publish the status update
      await this.redisClient.publish(channelName, JSON.stringify(data));
      
      // Set TTL for this job status key to prevent Redis from growing too large
      await this.redisClient.set(`job-status-ttl:${entityId}`, "active", "EX", REDIS_CHANNEL_TTL);
      
      // If this is a terminal status, set a shorter TTL
      if (data.status === 'completed' || data.status === 'failed' || 
          data.status === 'passed' || data.status === 'error') {
        // For terminal statuses, we'll keep the data for a shorter time since it's already recorded in the database
        await this.redisClient.set(`job-status-ttl:${entityId}`, "completed", "EX", 60 * 15); // 15 minutes
        this.logger.debug(`Set shorter TTL for completed entity ${entityId}: 15 minutes`);
      }
      
      this.logger.debug(`Status update published for entity ${entityId}`);
    } catch (error) {
      this.logger.error(`Failed to publish status update for entity ${entityId}:`, error);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Closing Redis connection');
    await this.redisClient.quit();
  }
} 