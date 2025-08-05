import nodemailer from "nodemailer";
import { Resend } from "resend";

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailService {
  private static instance: EmailService;

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Send email using available methods (SMTP or Resend)
   */
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; message: string; error?: string }> {
    // Try SMTP first
    const smtpResult = await this.sendViaSMTP(options);
    if (smtpResult.success) {
      return smtpResult;
    }

    // Fallback to Resend
    const resendResult = await this.sendViaResend(options);
    if (resendResult.success) {
      return resendResult;
    }

    // Both methods failed
    return {
      success: false,
      message: 'Email delivery failed',
      error: `SMTP failed: ${smtpResult.error}. Resend failed: ${resendResult.error}`
    };
  }

  private async sendViaSMTP(options: EmailOptions): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const smtpEnabled = process.env.SMTP_ENABLED !== 'false';

      if (!smtpEnabled) {
        return {
          success: false,
          message: '',
          error: 'SMTP is disabled via SMTP_ENABLED environment variable'
        };
      }

      // Use environment variables for SMTP configuration
      const smtpConfig = {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
        secure: process.env.SMTP_SECURE === 'true',
        fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
      };

      // Check if SMTP is configured
      if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.password) {
        return {
          success: false,
          message: '',
          error: 'SMTP not configured (missing environment variables)'
        };
      }

      // Prevent localhost connections for security
      if (smtpConfig.host === 'localhost' || smtpConfig.host === '127.0.0.1') {
        return {
          success: false,
          message: '',
          error: 'Localhost SMTP connections are not allowed'
        };
      }

      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.password,
        },
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 10000,
        greetingTimeout: 5000,
      });

      // Send email
      await transporter.sendMail({
        from: smtpConfig.fromEmail,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      return {
        success: true,
        message: 'Email sent successfully via SMTP'
      };
    } catch (error) {
      return {
        success: false,
        message: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async sendViaResend(options: EmailOptions): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const resendEnabled = process.env.RESEND_ENABLED !== 'false';

      if (!resendEnabled) {
        return {
          success: false,
          message: '',
          error: 'Resend is disabled via RESEND_ENABLED environment variable'
        };
      }

      const resendApiKey = process.env.RESEND_API_KEY;
      const resendFromEmail = process.env.RESEND_FROM_EMAIL;

      if (!resendApiKey) {
        return {
          success: false,
          message: '',
          error: 'Resend not configured (missing RESEND_API_KEY)'
        };
      }

      const resend = new Resend(resendApiKey);
      const fromEmail = resendFromEmail || 'noreply@yourdomain.com';

      const result = await resend.emails.send({
        from: fromEmail,
        to: [options.to],
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      if (result.error) {
        return {
          success: false,
          message: '',
          error: result.error.message
        };
      }

      return {
        success: true,
        message: `Email sent successfully via Resend (ID: ${result.data?.id})`
      };
    } catch (error) {
      return {
        success: false,
        message: '',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}