import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

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

async function testEmailConnection(config: any) {
  try {
    // Validate required fields
    if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) {
      throw new Error("Missing required SMTP configuration (host, user, password)");
    }

    // Prevent localhost connections for security
    if (config.smtpHost === 'localhost' || config.smtpHost === '127.0.0.1') {
      throw new Error("Localhost SMTP connections are not allowed. Please use a valid SMTP server.");
    }

    const port = parseInt(config.smtpPort) || 587;
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: port,
      secure: port === 465, // true for 465 (SSL), false for other ports like 587 (STARTTLS)
      auth: {
        user: config.smtpUser,
        pass: config.smtpPassword,
      },
      tls: {
        // Don't fail on invalid certs for testing
        rejectUnauthorized: false,
        // Enable STARTTLS for port 587
        ciphers: 'SSLv3'
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 5000,    // 5 seconds
    });

    // Verify the connection with timeout
    await Promise.race([
      transporter.verify(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout after 10 seconds")), 10000)
      )
    ]);
    
    return NextResponse.json({ success: true, message: "Email connection successful" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Email connection failed: ${error.message}` },
      { status: 400 }
    );
  }
}

async function testSlackConnection(config: any) {
  try {
    if (!config.webhookUrl) {
      throw new Error("Webhook URL is required");
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: "Test message from Supercheck - Connection test successful!",
        channel: config.channel,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return NextResponse.json({ success: true, message: "Slack connection successful" });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `Slack connection failed: ${error.message}` },
      { status: 400 }
    );
  }
}

async function testWebhookConnection(config: any) {
  try {
    if (!config.url) {
      throw new Error("URL is required");
    }

    const method = config.method || 'POST';
    const headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    const body = config.bodyTemplate 
      ? config.bodyTemplate.replace(/\{\{.*?\}\}/g, 'test-value')
      : JSON.stringify({ test: true, message: "Connection test from Supercheck" });

    const response = await fetch(config.url, {
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
      { success: false, error: `Webhook connection failed: ${error.message}` },
      { status: 400 }
    );
  }
}

async function testTelegramConnection(config: any) {
  try {
    if (!config.botToken || !config.chatId) {
      throw new Error("Bot token and chat ID are required");
    }

    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: config.chatId,
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
      { success: false, error: `Telegram connection failed: ${error.message}` },
      { status: 400 }
    );
  }
}

async function testDiscordConnection(config: any) {
  try {
    if (!config.discordWebhookUrl) {
      throw new Error("Discord webhook URL is required");
    }

    const response = await fetch(config.discordWebhookUrl, {
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
      { success: false, error: `Discord connection failed: ${error.message}` },
      { status: 400 }
    );
  }
} 