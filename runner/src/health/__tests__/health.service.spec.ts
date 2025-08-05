import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { HealthService, HealthStatus, ComponentHealth } from '../health.service';
import { DbService } from '../../execution/services/db.service';
import { RedisService } from '../../execution/services/redis.service';
import { ErrorHandler } from '../../common/utils/error-handler';

describe('HealthService', () => {
  let service: HealthService;
  let dbService: DbService;
  let redisService: RedisService;
  let configService: ConfigService;

  const mockDbService = {
    db: {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      limit: jest.fn(),
    },
  };

  const mockRedisService = {
    ping: jest.fn(),
    getQueueHealth: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: DbService,
          useValue: mockDbService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    dbService = module.get<DbService>(DbService);
    redisService = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have logger initialized', () => {
      expect(service['logger']).toBeInstanceOf(Logger);
    });
  });

  describe('getHealthStatus', () => {
    beforeEach(() => {
      // Setup successful health checks by default
      mockDbService.db.limit.mockResolvedValue([]);
      mockRedisService.ping.mockResolvedValue('PONG');
      mockRedisService.getQueueHealth.mockResolvedValue({ healthy: true });
    });

    it('should return healthy status when all components are healthy', async () => {
      const health = await service.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.checks.database.status).toBe('healthy');
      expect(health.checks.redis.status).toBe('healthy');
      expect(health.checks.queues.status).toBe('healthy');
    });

    it('should include correct metadata in health response', async () => {
      const health = await service.getHealthStatus();

      expect(health.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(health.version).toBeDefined();
      expect(typeof health.uptime).toBe('number');
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return degraded status when some components are unhealthy', async () => {
      mockDbService.db.limit.mockRejectedValue(new Error('Database error'));
      
      const health = await service.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.checks.database.status).toBe('unhealthy');
      expect(health.checks.redis.status).toBe('healthy');
      expect(health.checks.queues.status).toBe('healthy');
    });

    it('should return unhealthy status when all components are unhealthy', async () => {
      mockDbService.db.limit.mockRejectedValue(new Error('Database error'));
      mockRedisService.ping.mockRejectedValue(new Error('Redis error'));
      mockRedisService.getQueueHealth.mockRejectedValue(new Error('Queue error'));

      const health = await service.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.database.status).toBe('unhealthy');
      expect(health.checks.redis.status).toBe('unhealthy');
      expect(health.checks.queues.status).toBe('unhealthy');
    });

    it('should include response times for all checks', async () => {
      const health = await service.getHealthStatus();

      expect(typeof health.checks.database.responseTime).toBe('number');
      expect(typeof health.checks.redis.responseTime).toBe('number');
      expect(typeof health.checks.queues.responseTime).toBe('number');
      expect(health.checks.database.responseTime).toBeGreaterThanOrEqual(0);
      expect(health.checks.redis.responseTime).toBeGreaterThanOrEqual(0);
      expect(health.checks.queues.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle check failures gracefully', async () => {
      // Make all checks throw unexpected errors
      mockDbService.db.limit.mockImplementation(() => {
        throw new Error('Unexpected database error');
      });
      mockRedisService.ping.mockImplementation(() => {
        throw new Error('Unexpected redis error');
      });
      mockRedisService.getQueueHealth.mockImplementation(() => {
        throw new Error('Unexpected queue error');
      });

      const health = await service.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.database.status).toBe('unhealthy');
      expect(health.checks.redis.status).toBe('unhealthy');
      expect(health.checks.queues.status).toBe('unhealthy');
    });
  });

  describe('getReadinessStatus', () => {
    it('should return ready when health status is healthy', async () => {
      mockDbService.db.limit.mockResolvedValue([]);
      mockRedisService.ping.mockResolvedValue('PONG');
      mockRedisService.getQueueHealth.mockResolvedValue({ healthy: true });

      const readiness = await service.getReadinessStatus();

      expect(readiness.status).toBe('ready');
      expect(readiness.ready).toBe(true);
    });

    it('should return not ready when health status is unhealthy', async () => {
      mockDbService.db.limit.mockRejectedValue(new Error('Database error'));
      mockRedisService.ping.mockRejectedValue(new Error('Redis error'));
      mockRedisService.getQueueHealth.mockRejectedValue(new Error('Queue error'));

      const readiness = await service.getReadinessStatus();

      expect(readiness.status).toBe('not ready');
      expect(readiness.ready).toBe(false);
    });

    it('should return not ready when health status is degraded', async () => {
      mockDbService.db.limit.mockRejectedValue(new Error('Database error'));
      mockRedisService.ping.mockResolvedValue('PONG');
      mockRedisService.getQueueHealth.mockResolvedValue({ healthy: true });

      const readiness = await service.getReadinessStatus();

      expect(readiness.status).toBe('not ready');
      expect(readiness.ready).toBe(false);
    });
  });

  describe('getLivenessStatus', () => {
    it('should always return alive status', () => {
      const liveness = service.getLivenessStatus();

      expect(liveness.status).toBe('alive');
      expect(liveness.alive).toBe(true);
    });
  });

  describe('checkDatabase', () => {
    it('should return healthy status for successful database check', async () => {
      mockDbService.db.limit.mockResolvedValue([{ id: 1 }]);

      const result = await service['checkDatabase']();

      expect(result.status).toBe('healthy');
      expect(result.message).toBe('Database connection successful');
      expect(typeof result.responseTime).toBe('number');
    });

    it('should return unhealthy status for failed database check', async () => {
      const error = new Error('Connection timeout');
      mockDbService.db.limit.mockRejectedValue(error);
      
      // Mock ErrorHandler
      jest.spyOn(ErrorHandler, 'logError').mockImplementation();
      jest.spyOn(ErrorHandler, 'extractMessage').mockReturnValue('Connection timeout');

      const result = await service['checkDatabase']();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Connection timeout');
      expect(typeof result.responseTime).toBe('number');
      expect(ErrorHandler.logError).toHaveBeenCalled();
    });
  });

  describe('checkRedis', () => {
    it('should return healthy status for successful Redis check', async () => {
      mockRedisService.ping.mockResolvedValue('PONG');

      const result = await service['checkRedis']();

      expect(result.status).toBe('healthy');
      expect(result.message).toBe('Redis connection successful');
      expect(typeof result.responseTime).toBe('number');
    });

    it('should return unhealthy status for failed Redis check', async () => {
      const error = new Error('Redis connection failed');
      mockRedisService.ping.mockRejectedValue(error);
      
      // Mock ErrorHandler
      jest.spyOn(ErrorHandler, 'logError').mockImplementation();
      jest.spyOn(ErrorHandler, 'extractMessage').mockReturnValue('Redis connection failed');

      const result = await service['checkRedis']();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Redis connection failed');
      expect(typeof result.responseTime).toBe('number');
    });
  });

  describe('checkQueues', () => {
    it('should return healthy status when all queues are accessible', async () => {
      mockRedisService.getQueueHealth.mockResolvedValue({ healthy: true });

      const result = await service['checkQueues']();

      expect(result.status).toBe('healthy');
      expect(result.message).toBe('All queues accessible');
      expect(result.details).toEqual({ queueCount: 3 });
      expect(typeof result.responseTime).toBe('number');
    });

    it('should return unhealthy status when some queues are inaccessible', async () => {
      mockRedisService.getQueueHealth
        .mockResolvedValueOnce({ healthy: true })
        .mockRejectedValueOnce(new Error('Queue error'))
        .mockResolvedValueOnce({ healthy: true });

      const result = await service['checkQueues']();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('1/3 queues inaccessible');
      expect(result.details).toEqual({ failureCount: 1 });
    });

    it('should return unhealthy status when all queues are inaccessible', async () => {
      mockRedisService.getQueueHealth.mockRejectedValue(new Error('Queue error'));

      const result = await service['checkQueues']();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('3/3 queues inaccessible');
      expect(result.details).toEqual({ failureCount: 3 });
    });

    it('should handle queue check errors gracefully', async () => {
      mockRedisService.getQueueHealth.mockImplementation(() => {
        throw new Error('Unexpected queue error');
      });
      
      // Mock ErrorHandler
      jest.spyOn(ErrorHandler, 'logError').mockImplementation();
      jest.spyOn(ErrorHandler, 'extractMessage').mockReturnValue('Unexpected queue error');

      const result = await service['checkQueues']();

      expect(result.status).toBe('unhealthy');
      expect(result.message).toBe('Unexpected queue error');
    });
  });

  describe('determineOverallStatus', () => {
    const healthyCheck: ComponentHealth = { status: 'healthy' };
    const unhealthyCheck: ComponentHealth = { status: 'unhealthy' };

    it('should return healthy when all checks are healthy', () => {
      const status = service['determineOverallStatus']([
        healthyCheck,
        healthyCheck,
        healthyCheck,
      ]);

      expect(status).toBe('healthy');
    });

    it('should return degraded when some checks are unhealthy', () => {
      const status = service['determineOverallStatus']([
        healthyCheck,
        unhealthyCheck,
        healthyCheck,
      ]);

      expect(status).toBe('degraded');
    });

    it('should return unhealthy when all checks are unhealthy', () => {
      const status = service['determineOverallStatus']([
        unhealthyCheck,
        unhealthyCheck,
        unhealthyCheck,
      ]);

      expect(status).toBe('unhealthy');
    });

    it('should handle empty checks array', () => {
      const status = service['determineOverallStatus']([]);

      expect(status).toBe('healthy');
    });

    it('should handle single check', () => {
      expect(service['determineOverallStatus']([healthyCheck])).toBe('healthy');
      expect(service['determineOverallStatus']([unhealthyCheck])).toBe('unhealthy');
    });
  });

  describe('error handling', () => {
    it('should handle service initialization with missing dependencies', () => {
      expect(() => {
        new HealthService(null as any, null as any, null as any);
      }).not.toThrow();
    });
  });
});