import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '../s3.service';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  PutObjectCommand: jest.fn(),
  ListObjectsV2Command: jest.fn(),
  CreateBucketCommand: jest.fn(),
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

describe('S3Service', () => {
  let service: S3Service;
  let configService: ConfigService;
  let mockS3Client: jest.Mocked<S3Client>;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup S3Client mock
    mockS3Client = {
      send: jest.fn(),
    } as any;

    (S3Client as jest.Mock).mockImplementation(() => mockS3Client);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
    configService = module.get<ConfigService>(ConfigService);

    // Setup default config values
    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: any) => {
        const configs: Record<string, any> = {
          S3_JOB_BUCKET_NAME: 'test-job-bucket',
          S3_TEST_BUCKET_NAME: 'test-test-bucket',
          S3_ENDPOINT: 'http://localhost:9000',
          S3_ACCESS_KEY_ID: 'test-access-key',
          S3_SECRET_ACCESS_KEY: 'test-secret-key',
          S3_REGION: 'us-east-1',
          S3_FORCE_PATH_STYLE: 'true',
          S3_MAX_RETRIES: '3',
          S3_OPERATION_TIMEOUT_MS: '30000',
        };

        return configs[key] !== undefined ? configs[key] : defaultValue;
      },
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize with configuration values', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'S3_JOB_BUCKET_NAME',
        'playwright-job-artifacts',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'S3_TEST_BUCKET_NAME',
        'playwright-test-artifacts',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'S3_ENDPOINT',
        'http://localhost:9000',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'S3_ACCESS_KEY_ID',
        'minioadmin',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'S3_SECRET_ACCESS_KEY',
        'minioadmin',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'S3_REGION',
        'us-east-1',
      );
    });

    it('should create S3Client with correct configuration', () => {
      expect(S3Client).toHaveBeenCalledWith({
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
        forcePathStyle: true,
        maxAttempts: 3,
        requestHandler: expect.any(Object),
      });
    });
  });

  describe('onModuleInit', () => {
    it('should create buckets on module initialization', async () => {
      mockS3Client.send.mockResolvedValue({});

      await service.onModuleInit();

      expect(mockS3Client.send).toHaveBeenCalledTimes(2);
      expect(CreateBucketCommand).toHaveBeenCalledWith({
        Bucket: 'test-job-bucket',
      });
      expect(CreateBucketCommand).toHaveBeenCalledWith({
        Bucket: 'test-test-bucket',
      });
    });

    it('should handle bucket creation errors gracefully', async () => {
      const error = new Error('Bucket already exists');
      mockS3Client.send.mockRejectedValue(error);

      // Should not throw
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });

    it('should log bucket creation success', async () => {
      mockS3Client.send.mockResolvedValue({});
      const loggerSpy = jest
        .spyOn(service['logger'], 'log')
        .mockImplementation();

      await service.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith('S3 buckets ensured successfully');
    });

    it('should log bucket creation errors', async () => {
      const error = new Error('Network error');
      mockS3Client.send.mockRejectedValue(error);
      const loggerSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      await service.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Error ensuring S3 buckets:',
        'Network error',
      );
    });
  });

  describe('uploadText', () => {
    it('should upload text content to S3', async () => {
      const mockResult = { ETag: '"test-etag"' };
      mockS3Client.send.mockResolvedValue(mockResult);

      const result = await service.uploadText(
        'test-bucket',
        'test-key',
        'test content',
        'text/plain',
      );

      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'test-key',
          Body: 'test content',
          ContentType: 'text/plain',
        }),
      );
      expect(result).toBe(mockResult);
    });

    it('should use default content type when not provided', async () => {
      const mockResult = { ETag: '"test-etag"' };
      mockS3Client.send.mockResolvedValue(mockResult);

      await service.uploadText('test-bucket', 'test-key', 'test content');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'text/plain',
        }),
      );
    });

    it('should handle upload errors', async () => {
      const error = new Error('Upload failed');
      mockS3Client.send.mockRejectedValue(error);

      await expect(
        service.uploadText('test-bucket', 'test-key', 'test content'),
      ).rejects.toThrow('Upload failed');
    });
  });

  describe('uploadFile', () => {
    const fs = require('fs/promises');

    beforeEach(() => {
      fs.readFile.mockResolvedValue(Buffer.from('file content'));
    });

    it('should upload file to S3', async () => {
      const mockResult = { ETag: '"test-etag"' };
      mockS3Client.send.mockResolvedValue(mockResult);

      const result = await service.uploadFile(
        'test-bucket',
        'test-key',
        '/path/to/file.txt',
      );

      expect(fs.readFile).toHaveBeenCalledWith('/path/to/file.txt');
      expect(mockS3Client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: 'test-key',
          Body: expect.any(Buffer),
          ContentType: 'text/plain',
        }),
      );
      expect(result).toBe(mockResult);
    });

    it('should determine content type from file extension', async () => {
      const mockResult = { ETag: '"test-etag"' };
      mockS3Client.send.mockResolvedValue(mockResult);

      await service.uploadFile('test-bucket', 'test-key', '/path/to/file.html');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'text/html',
        }),
      );
    });

    it('should handle file read errors', async () => {
      const error = new Error('File not found');
      fs.readFile.mockRejectedValue(error);

      await expect(
        service.uploadFile('test-bucket', 'test-key', '/nonexistent/file.txt'),
      ).rejects.toThrow('File not found');
    });

    it('should handle S3 upload errors', async () => {
      const error = new Error('S3 upload failed');
      mockS3Client.send.mockRejectedValue(error);

      await expect(
        service.uploadFile('test-bucket', 'test-key', '/path/to/file.txt'),
      ).rejects.toThrow('S3 upload failed');
    });
  });

  describe('configuration handling', () => {
    it('should use default values when config is not provided', () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          return defaultValue;
        },
      );

      // Create new service instance to test defaults
      const newService = new S3Service(configService);

      expect(newService).toBeDefined();
    });

    it('should handle numeric configuration values', () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'S3_MAX_RETRIES') return '5';
          if (key === 'S3_OPERATION_TIMEOUT_MS') return '60000';
          return defaultValue;
        },
      );

      const newService = new S3Service(configService);

      expect(newService).toBeDefined();
    });

    it('should handle boolean configuration values', () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'S3_FORCE_PATH_STYLE') return 'false';
          return defaultValue;
        },
      );

      const newService = new S3Service(configService);

      expect(newService).toBeDefined();
    });
  });

  describe('error handling utilities', () => {
    it('should extract error message from Error objects', () => {
      const error = new Error('Test error message');
      // Test the utility function indirectly through service methods
      mockS3Client.send.mockRejectedValue(error);

      expect(service.uploadText('bucket', 'key', 'content')).rejects.toThrow(
        'Test error message',
      );
    });

    it('should handle non-Error objects', () => {
      const error = 'String error';
      mockS3Client.send.mockRejectedValue(error);

      expect(service.uploadText('bucket', 'key', 'content')).rejects.toThrow(
        'String error',
      );
    });
  });
});
