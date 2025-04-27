import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit {
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
      await this.redisClient.publish(channelName, JSON.stringify(data));
      this.logger.debug(`Status update published for test ${testId}`);
    } catch (error) {
      this.logger.error(`Failed to publish status update for test ${testId}:`, error);
    }
  }

  /**
   * Publish a job status update
   * @param jobId The ID of the job
   * @param data The status data to publish
   */
  async publishJobStatus(jobId: string, data: any): Promise<void> {
    const channelName = `job-status:${jobId}`;
    this.logger.debug(`Publishing job status update to ${channelName}:`, data);
    
    try {
      await this.redisClient.publish(channelName, JSON.stringify(data));
      this.logger.debug(`Status update published for job ${jobId}`);
    } catch (error) {
      this.logger.error(`Failed to publish status update for job ${jobId}:`, error);
    }
  }

  async onModuleDestroy() {
    this.logger.log('Closing Redis connection');
    await this.redisClient.quit();
  }
} 