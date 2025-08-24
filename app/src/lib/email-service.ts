import nodemailer from "nodemailer";

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
   * Send email using SMTP
   */
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; message: string; error?: string }> {
    return await this.sendViaSMTP(options);
  }

  private async sendViaSMTP(options: EmailOptions): Promise<{ success: boolean; message: string; error?: string }> {
    try {
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
}