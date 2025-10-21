import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { type NotificationProviderConfig } from "@/db/schema/schema";

export async function POST(req: NextRequest) {
  try {
    const { type, config } = await req.json();

    switch (type) {
      case 'email':
        return await testEmailConnection(config);
      case 'slack':
        return await testSlackConnection(config);
      case 'webhook':
        return await testWebhookConnection(config);
      case 'telegram':
        return await testTelegramConnection(config);
      case 'discord':
        return await testDiscordConnection(config);
      default:
        return NextResponse.json(
          { success: false, error: "Unsupported provider type" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error testing connection:", error);
    return NextResponse.json(
      { success: false, error: "Failed to test connection" },
      { status: 500 }
    );
  }
}

async function testEmailConnection(config: NotificationProviderConfig) {
  try {
    // Validate emails field (new format)
    const typedConfig = config as Record<string, unknown>;
    if (!typedConfig.emails || !(typedConfig.emails as string).trim()) {
      throw new Error("At least one email address is required");
    }

    // Validate email format
    const emailList = (typedConfig.emails as string).split(',').map(email => email.trim()).filter(email => email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    for (const email of emailList) {
      if (!emailRegex.test(email)) {
        throw new Error(`Invalid email format: ${email}`);
      }
    }

    // Test SMTP connection
    const smtpResult = await testSMTPConnection(emailList[0]);
    
    if (smtpResult.success) {
      return NextResponse.json({ 
        success: true, 
        message: `Email connection successful via SMTP. Test email sent to ${emailList[0]}.`,
        details: smtpResult
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: `SMTP email connection failed: ${smtpResult.error}`,
          details: smtpResult
        },
        { status: 400 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Email connection failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 400 }
    );
  }
}

async function testSMTPConnection(testEmail: string): Promise<{ success: boolean; message: string; error: string }> {
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

    // Verify the connection with timeout
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout after 10 seconds")), 10000)
      )
    ]);

    // Test sending email
    await transporter.sendMail({
      from: smtpConfig.fromEmail,
      to: testEmail,
      subject: 'Supercheck - SMTP Test Email',
      text: 'This is a test email to verify your SMTP configuration is working correctly.',
      html: '<p>This is a test email to verify your <strong>SMTP configuration</strong> is working correctly.</p>',
    });

    return {
      success: true,
      message: 'SMTP connection successful',
      error: ''
    };
  } catch (error) {
    return {
      success: false,
      message: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testSlackConnection(config: NotificationProviderConfig) {
  try {
    const typedConfig = config as Record<string, unknown>;
    if (!typedConfig.webhookUrl) {
      throw new Error("Webhook URL is required");
    }

    const response = await fetch(typedConfig.webhookUrl as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: "Test message from Supercheck - Connection test successful!",
        channel: typedConfig.channel,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return NextResponse.json({ success: true, message: "Slack connection successful" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Slack connection failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 400 }
    );
  }
}

async function testWebhookConnection(config: NotificationProviderConfig) {
  try {
    const typedConfig = config as Record<string, unknown>;
    if (!typedConfig.url) {
      throw new Error("URL is required");
    }

    const method = (typedConfig.method as string) || 'POST';
    const headers = {
      'Content-Type': 'application/json',
      ...(typedConfig.headers as Record<string, string>),
    };

    const body = typedConfig.bodyTemplate
      ? (typedConfig.bodyTemplate as string).replace(/\{\{.*?\}\}/g, 'test-value')
      : JSON.stringify({ test: true, message: "Connection test from Supercheck" });

    const response = await fetch(typedConfig.url as string, {
      method,
      headers,
      body: method !== 'GET' ? body : undefined,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return NextResponse.json({ success: true, message: "Webhook connection successful" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Webhook connection failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 400 }
    );
  }
}

async function testTelegramConnection(config: NotificationProviderConfig) {
  try {
    const typedConfig = config as Record<string, unknown>;
    if (!typedConfig.botToken || !typedConfig.chatId) {
      throw new Error("Bot token and chat ID are required");
    }

    const url = `https://api.telegram.org/bot${typedConfig.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: typedConfig.chatId,
        text: "Test message from Supercheck - Connection test successful!",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.description || `HTTP ${response.status}`);
    }

    return NextResponse.json({ success: true, message: "Telegram connection successful" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Telegram connection failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 400 }
    );
  }
}

async function testDiscordConnection(config: NotificationProviderConfig) {
  try {
    const typedConfig = config as Record<string, unknown>;
    if (!typedConfig.discordWebhookUrl) {
      throw new Error("Discord webhook URL is required");
    }

    const response = await fetch(typedConfig.discordWebhookUrl as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: "Test message from Supercheck - Connection test successful!",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return NextResponse.json({ success: true, message: "Discord connection successful" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Discord connection failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 400 }
    );
  }
}