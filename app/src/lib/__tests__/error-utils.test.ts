import { getUserFriendlyError, VALIDATION_PATTERNS, CHARACTER_LIMITS } from '../error-utils';

describe('error-utils', () => {
  describe('getUserFriendlyError', () => {
    describe('connection errors', () => {
      it('should handle ENOTFOUND errors', () => {
        const error = new Error('getaddrinfo ENOTFOUND invalid.domain.com');
        const result = getUserFriendlyError(error, 'Email');
        expect(result).toBe('Unable to connect to Email service. Please check your configuration.');
      });

      it('should handle ECONNREFUSED errors', () => {
        const error = new Error('connect ECONNREFUSED 127.0.0.1:587');
        const result = getUserFriendlyError(error, 'SMTP');
        expect(result).toBe('Unable to connect to SMTP service. Please check your configuration.');
      });
    });

    describe('timeout errors', () => {
      it('should handle timeout errors', () => {
        const error = new Error('Request timeout after 5000ms');
        const result = getUserFriendlyError(error, 'Slack');
        expect(result).toBe('Connection timeout. Please try again or check your network connection.');
      });

      it('should handle ETIMEDOUT errors', () => {
        const error = new Error('connect ETIMEDOUT 192.168.1.1:443');
        const result = getUserFriendlyError(error, 'Discord');
        expect(result).toBe('Connection timeout. Please try again or check your network connection.');
      });
    });

    describe('authentication errors', () => {
      it('should handle 401 errors', () => {
        const error = new Error('Request failed with status 401');
        const result = getUserFriendlyError(error, 'Telegram');
        expect(result).toBe('Authentication failed. Please verify your credentials.');
      });

      it('should handle 403 errors', () => {
        const error = new Error('HTTP 403 Forbidden');
        const result = getUserFriendlyError(error, 'Teams');
        expect(result).toBe('Authentication failed. Please verify your credentials.');
      });
    });

    describe('SSL/TLS errors', () => {
      it('should handle SSL errors', () => {
        const error = new Error('SSL certificate verification failed');
        const result = getUserFriendlyError(error, 'Webhook');
        expect(result).toBe('Security connection failed. Please check your SSL/TLS settings.');
      });

      it('should handle TLS errors', () => {
        const error = new Error('TLS handshake failed');
        const result = getUserFriendlyError(error, 'API');
        expect(result).toBe('Security connection failed. Please check your SSL/TLS settings.');
      });
    });

    describe('email specific errors', () => {
      it('should handle invalid email format errors', () => {
        const error = new Error('Invalid email format: not-an-email');
        const result = getUserFriendlyError(error, 'Email');
        expect(result).toBe('Please check your email addresses format.');
      });

      it('should handle SMTP configuration errors', () => {
        const error = new Error('SMTP configuration missing: host not specified');
        const result = getUserFriendlyError(error, 'Email');
        expect(result).toBe('Email service is not properly configured. Please contact your administrator.');
      });
    });

    describe('webhook errors', () => {
      it('should handle webhook required errors', () => {
        const error = new Error('webhook URL is required for this provider');
        const result = getUserFriendlyError(error, 'Slack');
        expect(result).toBe('Slack webhook URL is required. Please check your configuration.');
      });
    });

    describe('HTTP status errors', () => {
      it('should handle 400 errors', () => {
        const error = new Error('400 Bad Request: Invalid payload');
        const result = getUserFriendlyError(error, 'Discord');
        expect(result).toBe('Invalid configuration for Discord. Please check your settings.');
      });

      it('should handle Bad Request errors', () => {
        const error = new Error('Bad Request: Missing required fields');
        const result = getUserFriendlyError(error, 'Teams');
        expect(result).toBe('Invalid configuration for Teams. Please check your settings.');
      });

      it('should handle 404 errors', () => {
        const error = new Error('404 Not Found');
        const result = getUserFriendlyError(error, 'Webhook');
        expect(result).toBe('Webhook endpoint not found. Please verify your configuration.');
      });

      it('should handle Not Found errors', () => {
        const error = new Error('Endpoint Not Found');
        const result = getUserFriendlyError(error, 'API');
        expect(result).toBe('API endpoint not found. Please verify your configuration.');
      });

      it('should handle 500 errors', () => {
        const error = new Error('500 Internal Server Error');
        const result = getUserFriendlyError(error, 'Slack');
        expect(result).toBe('Slack service is currently unavailable. Please try again later.');
      });

      it('should handle Internal Server Error', () => {
        const error = new Error('Internal Server Error occurred');
        const result = getUserFriendlyError(error, 'Teams');
        expect(result).toBe('Teams service is currently unavailable. Please try again later.');
      });
    });

    describe('generic errors', () => {
      it('should handle non-Error objects', () => {
        const error = 'String error message';
        const result = getUserFriendlyError(error, 'Email');
        expect(result).toBe('Email connection test failed. Please check your configuration and try again.');
      });

      it('should handle unknown Error objects', () => {
        const error = new Error('Some unknown error occurred');
        const result = getUserFriendlyError(error, 'Custom');
        expect(result).toBe('Custom connection test failed. Please check your configuration and try again.');
      });

      it('should handle null/undefined errors', () => {
        const result1 = getUserFriendlyError(null, 'Service');
        const result2 = getUserFriendlyError(undefined, 'Service');
        
        expect(result1).toBe('Service connection test failed. Please check your configuration and try again.');
        expect(result2).toBe('Service connection test failed. Please check your configuration and try again.');
      });
    });

    describe('error precedence', () => {
      it('should prioritize more specific error patterns', () => {
        // Test that more specific patterns are matched first
        const error = new Error('401 SSL certificate verification failed');
        const result = getUserFriendlyError(error, 'API');
        // Should match SSL pattern before 401 pattern
        expect(result).toBe('Security connection failed. Please check your SSL/TLS settings.');
      });
    });
  });

  describe('VALIDATION_PATTERNS', () => {
    describe('email pattern', () => {
      it('should validate correct email addresses', () => {
        const validEmails = [
          'test@example.com',
          'user.name@domain.co.uk',
          'user+tag@example.org',
          'user123@test123.com',
        ];

        validEmails.forEach(email => {
          expect(VALIDATION_PATTERNS.email.test(email)).toBe(true);
        });
      });

      it('should reject invalid email addresses', () => {
        const invalidEmails = [
          'invalid-email',
          '@domain.com',
          'user@',
          'user name@domain.com',
          'user@domain',
          '',
        ];

        invalidEmails.forEach(email => {
          expect(VALIDATION_PATTERNS.email.test(email)).toBe(false);
        });
      });
    });

    describe('slackWebhook pattern', () => {
      it('should validate correct Slack webhook URLs', () => {
        const validWebhooks = [
          'https://hooks.slack.com/services/T123/B456/xyz123',
          'https://hooks.slack.com/services/TEAM/CHANNEL/TOKEN',
        ];

        validWebhooks.forEach(webhook => {
          expect(VALIDATION_PATTERNS.slackWebhook.test(webhook)).toBe(true);
        });
      });

      it('should reject invalid Slack webhook URLs', () => {
        const invalidWebhooks = [
          'http://hooks.slack.com/services/T123/B456/xyz123',
          'https://hooks.example.com/services/T123/B456/xyz123',
          'https://slack.com/webhook',
          '',
        ];

        invalidWebhooks.forEach(webhook => {
          expect(VALIDATION_PATTERNS.slackWebhook.test(webhook)).toBe(false);
        });
      });
    });

    describe('slackChannel pattern', () => {
      it('should validate correct Slack channel names', () => {
        const validChannels = [
          '#general',
          '#random',
          '#dev-team',
          '#alerts_123',
          '#test-channel',
        ];

        validChannels.forEach(channel => {
          expect(VALIDATION_PATTERNS.slackChannel.test(channel)).toBe(true);
        });
      });

      it('should reject invalid Slack channel names', () => {
        const invalidChannels = [
          'general',
          '#General',  // uppercase not allowed
          '#spaces not allowed',
          '#special@chars',
          '',
        ];

        invalidChannels.forEach(channel => {
          expect(VALIDATION_PATTERNS.slackChannel.test(channel)).toBe(false);
        });
      });
    });

    describe('telegramBotToken pattern', () => {
      it('should validate correct Telegram bot tokens', () => {
        const validTokens = [
          '123456789:ABCdefGHIjklMNOpqrSTUvwxyz',
          '987654321:XYZ123abc456DEF789ghi',
        ];

        validTokens.forEach(token => {
          expect(VALIDATION_PATTERNS.telegramBotToken.test(token)).toBe(true);
        });
      });

      it('should reject invalid Telegram bot tokens', () => {
        const invalidTokens = [
          '123456789',
          ':ABCdefGHIjklMNOpqrSTUvwxyz',
          '123456789-ABCdefGHIjklMNOpqrSTUvwxyz',
          '',
        ];

        invalidTokens.forEach(token => {
          expect(VALIDATION_PATTERNS.telegramBotToken.test(token)).toBe(false);
        });
      });
    });

    describe('telegramChatId pattern', () => {
      it('should validate correct Telegram chat IDs', () => {
        const validChatIds = [
          '123456789',
          '-123456789',
          '0',
        ];

        validChatIds.forEach(chatId => {
          expect(VALIDATION_PATTERNS.telegramChatId.test(chatId)).toBe(true);
        });
      });

      it('should reject invalid Telegram chat IDs', () => {
        const invalidChatIds = [
          'abc123',
          '123.456',
          '',
          '-',
        ];

        invalidChatIds.forEach(chatId => {
          expect(VALIDATION_PATTERNS.telegramChatId.test(chatId)).toBe(false);
        });
      });
    });

    describe('discordWebhook pattern', () => {
      it('should validate correct Discord webhook URLs', () => {
        const validWebhooks = [
          'https://discord.com/api/webhooks/123/abc',
          'https://discordapp.com/api/webhooks/456/def',
        ];

        validWebhooks.forEach(webhook => {
          expect(VALIDATION_PATTERNS.discordWebhook.test(webhook)).toBe(true);
        });
      });

      it('should reject invalid Discord webhook URLs', () => {
        const invalidWebhooks = [
          'http://discord.com/api/webhooks/123/abc',
          'https://example.com/api/webhooks/123/abc',
          'https://discord.com/webhooks/123/abc',
          '',
        ];

        invalidWebhooks.forEach(webhook => {
          expect(VALIDATION_PATTERNS.discordWebhook.test(webhook)).toBe(false);
        });
      });
    });

    describe('teamsWebhook pattern', () => {
      it('should validate correct Teams webhook URLs', () => {
        const validWebhooks = [
          'https://example.webhook.office.com/webhookb2/abc',
          'https://company.webhook.office.com/webhookb2/123/def',
        ];

        validWebhooks.forEach(webhook => {
          expect(VALIDATION_PATTERNS.teamsWebhook.test(webhook)).toBe(true);
        });
      });

      it('should reject invalid Teams webhook URLs', () => {
        const invalidWebhooks = [
          'http://example.webhook.office.com/webhookb2/abc',
          'https://example.com/webhook',
          'https://webhook.office.com/abc',
          '',
        ];

        invalidWebhooks.forEach(webhook => {
          expect(VALIDATION_PATTERNS.teamsWebhook.test(webhook)).toBe(false);
        });
      });
    });

    describe('httpUrl pattern', () => {
      it('should validate correct HTTP/HTTPS URLs', () => {
        const validUrls = [
          'http://example.com',
          'https://example.com',
          'https://subdomain.example.com/path',
          'http://localhost:3000',
        ];

        validUrls.forEach(url => {
          expect(VALIDATION_PATTERNS.httpUrl.test(url)).toBe(true);
        });
      });

      it('should reject invalid URLs', () => {
        const invalidUrls = [
          'ftp://example.com',
          'example.com',
          'www.example.com',
          '',
        ];

        invalidUrls.forEach(url => {
          expect(VALIDATION_PATTERNS.httpUrl.test(url)).toBe(false);
        });
      });
    });
  });

  describe('CHARACTER_LIMITS', () => {
    it('should have correct character limits', () => {
      expect(CHARACTER_LIMITS.emails).toBe(500);
      expect(CHARACTER_LIMITS.bodyTemplate).toBe(2000);
      expect(CHARACTER_LIMITS.name).toBe(255);
      expect(CHARACTER_LIMITS.url).toBe(2048);
    });

    it('should be readonly', () => {
      // TypeScript should prevent this, but let's ensure runtime behavior
      expect(() => {
        (CHARACTER_LIMITS as Record<string, number>).emails = 1000;
      }).toThrow();
    });
  });
});