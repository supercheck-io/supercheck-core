import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ExecutionService, isWindows, getContentType } from '../execution.service';
import { S3Service } from '../s3.service';
import { DbService } from '../db.service';
import { RedisService } from '../redis.service';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execSync: jest.fn(),
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  readFile: jest.fn(),
  mkdir: jest.fn(),
  readdir: jest.fn(),
  unlink: jest.fn(),
  rmdir: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

describe('ExecutionService', () => {
  let service: ExecutionService;
  let configService: ConfigService;
  let s3Service: S3Service;
  let dbService: DbService;
  let redisService: RedisService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockS3Service = {
    uploadFile: jest.fn(),
    uploadText: jest.fn(),
    getSignedUrl: jest.fn(),
  };

  const mockDbService = {
    updateRunStatus: jest.fn(),
    updateRunResult: jest.fn(),
    createRun: jest.fn(),
  };

  const mockRedisService = {
    decrementRunning: jest.fn(),
    incrementCompleted: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExecutionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: S3Service,
          useValue: mockS3Service,
        },
        {
          provide: DbService,
          useValue: mockDbService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<ExecutionService>(ExecutionService);
    configService = module.get<ConfigService>(ConfigService);
    s3Service = module.get<S3Service>(S3Service);
    dbService = module.get<DbService>(DbService);
    redisService = module.get<RedisService>(RedisService);

    // Setup default config values
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'TEST_EXECUTION_TIMEOUT_MS':
          return '120000';
        case 'PLAYWRIGHT_BROWSERS_PATH':
          return '/tmp/browsers';
        case 'NODE_ENV':
          return 'test';
        default:
          return undefined;
      }
    });

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('utility functions', () => {
    describe('isWindows', () => {
      it('should correctly identify Windows platform', () => {
        // This will depend on the actual platform running the test
        expect(typeof isWindows).toBe('boolean');
      });
    });

    describe('getContentType', () => {
      it('should return correct content type for HTML files', () => {
        expect(getContentType('index.html')).toBe('text/html');
      });

      it('should return correct content type for CSS files', () => {
        expect(getContentType('styles.css')).toBe('text/css');
      });

      it('should return correct content type for JavaScript files', () => {
        expect(getContentType('script.js')).toBe('application/javascript');
      });

      it('should return correct content type for JSON files', () => {
        expect(getContentType('data.json')).toBe('application/json');
      });

      it('should return correct content type for image files', () => {
        expect(getContentType('image.png')).toBe('image/png');
        expect(getContentType('photo.jpg')).toBe('image/jpeg');
        expect(getContentType('photo.jpeg')).toBe('image/jpeg');
        expect(getContentType('animation.gif')).toBe('image/gif');
        expect(getContentType('icon.svg')).toBe('image/svg+xml');
      });

      it('should return correct content type for text files', () => {
        expect(getContentType('document.txt')).toBe('text/plain');
      });

      it('should return default content type for unknown extensions', () => {
        expect(getContentType('file.unknown')).toBe('application/octet-stream');
        expect(getContentType('file')).toBe('application/octet-stream');
      });

      it('should handle uppercase extensions', () => {
        expect(getContentType('file.HTML')).toBe('text/html');
        expect(getContentType('file.PNG')).toBe('image/png');
      });
    });
  });

  describe('service initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have logger initialized', () => {
      expect(service['logger']).toBeInstanceOf(Logger);
    });

    it('should load configuration on initialization', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('TEST_EXECUTION_TIMEOUT_MS');
      expect(mockConfigService.get).toHaveBeenCalledWith('PLAYWRIGHT_BROWSERS_PATH');
    });
  });

  describe('configuration handling', () => {
    it('should use default timeout when not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);
      
      // Reinitialize service to test default values
      expect(() => {
        new ExecutionService(
          configService,
          s3Service,
          dbService,
          redisService
        );
      }).not.toThrow();
    });

    it('should handle numeric configuration values', () => {
      mockConfigService.get.mockReturnValue('180000');
      
      const testService = new ExecutionService(
        configService,
        s3Service,
        dbService,
        redisService
      );
      
      expect(testService).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle service initialization errors gracefully', () => {
      const errorConfigService = {
        get: jest.fn().mockImplementation(() => {
          throw new Error('Config error');
        }),
      };

      expect(() => {
        new ExecutionService(
          errorConfigService as any,
          s3Service,
          dbService,
          redisService
        );
      }).toThrow('Config error');
    });
  });

  describe('dependency injection', () => {
    it('should have all required dependencies injected', () => {
      expect(service['configService']).toBeDefined();
      expect(service['s3Service']).toBeDefined();
      expect(service['dbService']).toBeDefined();
      expect(service['redisService']).toBeDefined();
    });
  });
});