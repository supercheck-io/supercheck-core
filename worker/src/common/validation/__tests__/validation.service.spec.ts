import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, Logger } from '@nestjs/common';
import { ValidationService } from '../validation.service';
import { z, ZodSchema, ZodError } from 'zod';

describe('ValidationService', () => {
  let service: ValidationService;
  let loggerSpy: {
    warn: jest.SpyInstance;
    debug: jest.SpyInstance;
  };

  // Test schemas
  const userSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email format'),
    age: z.number().min(0, 'Age must be positive').optional(),
  });

  const simpleStringSchema = z
    .string()
    .min(3, 'String must be at least 3 characters');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ValidationService],
    }).compile();

    service = module.get<ValidationService>(ValidationService);

    // Setup logger spies
    loggerSpy = {
      warn: jest.spyOn(service['logger'], 'warn').mockImplementation(),
      debug: jest.spyOn(service['logger'], 'debug').mockImplementation(),
    };
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

  describe('validate', () => {
    describe('successful validation', () => {
      it('should validate correct data and return parsed result', () => {
        const validData = {
          name: 'John Doe',
          email: 'john@example.com',
          age: 30,
        };

        const result = service.validate(userSchema, validData);

        expect(result).toEqual(validData);
        expect(loggerSpy.warn).not.toHaveBeenCalled();
      });

      it('should validate data with optional fields missing', () => {
        const validData = {
          name: 'Jane Doe',
          email: 'jane@example.com',
        };

        const result = service.validate(userSchema, validData);

        expect(result).toEqual(validData);
      });

      it('should validate simple primitive types', () => {
        const validString = 'valid string';

        const result = service.validate(simpleStringSchema, validString);

        expect(result).toBe(validString);
      });

      it('should handle Zod transformations', () => {
        const transformSchema = z
          .string()
          .transform((val) => val.toUpperCase());
        const input = 'hello world';

        const result = service.validate(transformSchema, input);

        expect(result).toBe('HELLO WORLD');
      });
    });

    describe('validation failures', () => {
      it('should throw BadRequestException for invalid data', () => {
        const invalidData = {
          name: '',
          email: 'invalid-email',
          age: -5,
        };

        expect(() => service.validate(userSchema, invalidData)).toThrow(
          BadRequestException,
        );
      });

      it('should include detailed error messages in exception', () => {
        const invalidData = {
          name: '',
          email: 'invalid-email',
        };

        try {
          service.validate(userSchema, invalidData);
          fail('Should have thrown BadRequestException');
        } catch (error) {
          expect(error).toBeInstanceOf(BadRequestException);

          const response = error.getResponse();
          expect(response.message).toBe('Validation failed');
          expect(response.errors).toContain(
            'name: String must contain at least 1 character(s)',
          );
          expect(response.errors).toContain('email: Invalid email');
        }
      });

      it('should log validation errors as warnings', () => {
        const invalidData = { name: '', email: 'bad-email' };

        try {
          service.validate(userSchema, invalidData);
        } catch (error) {
          // Expected to throw
        }

        expect(loggerSpy.warn).toHaveBeenCalledWith(
          'Validation failed:',
          expect.arrayContaining([
            expect.stringContaining('name:'),
            expect.stringContaining('email:'),
          ]),
        );
      });

      it('should handle nested object validation errors', () => {
        const nestedSchema = z.object({
          user: z.object({
            profile: z.object({
              name: z.string().min(1),
            }),
          }),
        });

        const invalidData = {
          user: {
            profile: {
              name: '',
            },
          },
        };

        try {
          service.validate(nestedSchema, invalidData);
          fail('Should have thrown');
        } catch (error) {
          const response = error.getResponse();
          expect(response.errors).toContain(
            'user.profile.name: String must contain at least 1 character(s)',
          );
        }
      });

      it('should handle array validation errors', () => {
        const arraySchema = z.object({
          items: z
            .array(z.string().min(1))
            .min(1, 'At least one item required'),
        });

        const invalidData = {
          items: ['', 'valid'],
        };

        try {
          service.validate(arraySchema, invalidData);
          fail('Should have thrown');
        } catch (error) {
          const response = error.getResponse();
          expect(response.errors).toContain(
            'items.0: String must contain at least 1 character(s)',
          );
        }
      });
    });

    describe('non-ZodError handling', () => {
      it('should re-throw non-ZodError exceptions', () => {
        const errorSchema = z.any().refine(() => {
          throw new Error('Custom error');
        });

        expect(() => service.validate(errorSchema, 'test')).toThrow(
          'Custom error',
        );
        expect(loggerSpy.warn).not.toHaveBeenCalled();
      });

      it('should handle schema compilation errors', () => {
        // Force a non-ZodError by creating an invalid schema reference
        const brokenSchema = null as any as ZodSchema<string>;

        expect(() => service.validate(brokenSchema, 'test')).toThrow();
      });
    });
  });

  describe('safeValidate', () => {
    describe('successful validation', () => {
      it('should return validated data for correct input', () => {
        const validData = {
          name: 'John Doe',
          email: 'john@example.com',
        };

        const result = service.safeValidate(userSchema, validData);

        expect(result).toEqual(validData);
        expect(loggerSpy.debug).not.toHaveBeenCalled();
      });

      it('should handle optional fields correctly', () => {
        const validData = {
          name: 'Jane Doe',
          email: 'jane@example.com',
          age: 25,
        };

        const result = service.safeValidate(userSchema, validData);

        expect(result).toEqual(validData);
      });
    });

    describe('validation failures', () => {
      it('should return null for invalid data', () => {
        const invalidData = {
          name: '',
          email: 'invalid-email',
        };

        const result = service.safeValidate(userSchema, invalidData);

        expect(result).toBeNull();
      });

      it('should log validation errors as debug messages', () => {
        const invalidData = { name: '', email: 'bad-email' };

        service.safeValidate(userSchema, invalidData);

        expect(loggerSpy.debug).toHaveBeenCalledWith(
          'Safe validation failed:',
          expect.any(Array),
        );
      });

      it('should not throw exceptions for invalid data', () => {
        const invalidData = {
          name: '',
          email: 'invalid-email',
          age: -1,
        };

        expect(() =>
          service.safeValidate(userSchema, invalidData),
        ).not.toThrow();
      });
    });

    describe('non-ZodError handling', () => {
      it('should re-throw non-ZodError exceptions', () => {
        const errorSchema = z.any().refine(() => {
          throw new Error('Custom validation error');
        });

        expect(() => service.safeValidate(errorSchema, 'test')).toThrow(
          'Custom validation error',
        );
      });
    });
  });

  describe('validateWithTransform', () => {
    describe('successful validation and transformation', () => {
      it('should validate data and apply transformation', () => {
        const validData = {
          name: 'John Doe',
          email: 'john@example.com',
          age: 30,
        };

        const transform = (user: any) => ({
          fullName: user.name,
          contactEmail: user.email,
          years: user.age || 0,
        });

        const result = service.validateWithTransform(
          userSchema,
          validData,
          transform,
        );

        expect(result).toEqual({
          fullName: 'John Doe',
          contactEmail: 'john@example.com',
          years: 30,
        });
      });

      it('should handle transformations that return different types', () => {
        const stringData = 'hello world';
        const transform = (str: string) => str.length;

        const result = service.validateWithTransform(
          simpleStringSchema,
          stringData,
          transform,
        );

        expect(result).toBe(11);
        expect(typeof result).toBe('number');
      });

      it('should handle complex transformations', () => {
        const userData = {
          name: 'Jane Smith',
          email: 'jane@company.com',
        };

        const transform = (user: any) => ({
          ...user,
          displayName: user.name.toUpperCase(),
          domain: user.email.split('@')[1],
          createdAt: new Date('2024-01-01'),
        });

        const result = service.validateWithTransform(
          userSchema,
          userData,
          transform,
        );

        expect(result.displayName).toBe('JANE SMITH');
        expect(result.domain).toBe('company.com');
        expect(result.createdAt).toBeInstanceOf(Date);
      });
    });

    describe('validation failure', () => {
      it('should throw BadRequestException if validation fails', () => {
        const invalidData = {
          name: '',
          email: 'invalid-email',
        };

        const transform = (user: any) => user.name;

        expect(() =>
          service.validateWithTransform(userSchema, invalidData, transform),
        ).toThrow(BadRequestException);
      });

      it('should not call transform function if validation fails', () => {
        const invalidData = { name: '', email: 'bad-email' };
        const transform = jest.fn();

        try {
          service.validateWithTransform(userSchema, invalidData, transform);
        } catch (error) {
          // Expected to throw
        }

        expect(transform).not.toHaveBeenCalled();
      });
    });

    describe('transformation errors', () => {
      it('should propagate errors from transform function', () => {
        const validData = {
          name: 'John Doe',
          email: 'john@example.com',
        };

        const errorTransform = () => {
          throw new Error('Transform failed');
        };

        expect(() =>
          service.validateWithTransform(userSchema, validData, errorTransform),
        ).toThrow('Transform failed');
      });

      it('should handle null/undefined transform results', () => {
        const validData = {
          name: 'John Doe',
          email: 'john@example.com',
        };

        const nullTransform = () => null;
        const undefinedTransform = () => undefined;

        expect(
          service.validateWithTransform(userSchema, validData, nullTransform),
        ).toBeNull();
        expect(
          service.validateWithTransform(
            userSchema,
            validData,
            undefinedTransform,
          ),
        ).toBeUndefined();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const emptySchema = z.object({});
      const result = service.validate(emptySchema, {});

      expect(result).toEqual({});
    });

    it('should handle null and undefined inputs', () => {
      const nullableSchema = z.string().nullable();

      expect(service.validate(nullableSchema, null)).toBeNull();
      expect(service.safeValidate(z.string(), null)).toBeNull();
    });

    it('should handle very large objects', () => {
      const largeObject = Array.from({ length: 1000 }, (_, i) => [
        `key${i}`,
        `value${i}`,
      ]).reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

      const dynamicSchema = z.record(z.string());

      const result = service.validate(dynamicSchema, largeObject);
      expect(Object.keys(result)).toHaveLength(1000);
    });

    it('should handle circular reference detection in error messages', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // This should not crash even with circular references
      const result = service.safeValidate(
        z.object({ name: z.string() }),
        circularObj,
      );
      expect(result).toEqual({ name: 'test' });
    });
  });
});
