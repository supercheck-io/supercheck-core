/**
 * Email templates for status page subscriptions
 */

type VerificationEmailParams = {
  email: string;
  statusPageName: string;
  verificationUrl: string;
};

export function getVerificationEmailTemplate(params: VerificationEmailParams): {
  subject: string;
  text: string;
  html: string;
} {
  const { statusPageName, verificationUrl } = params;

  const subject = `Verify your subscription to ${statusPageName}`;

  const text = `
Hello,

Thank you for subscribing to ${statusPageName} status updates!

Please verify your email address by clicking the link below:
${verificationUrl}

This link will expire in 24 hours.

If you did not request this subscription, you can safely ignore this email.

---
Powered by Supercheck
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Subscription</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 32px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                Verify Your Subscription
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.5;">
                Thank you for subscribing to <strong>${statusPageName}</strong> status updates!
              </p>

              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.5;">
                To complete your subscription and start receiving notifications about incidents and maintenance, please verify your email address:
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" style="display: inline-block; padding: 14px 32px; background: #667eea; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                Or copy and paste this URL into your browser:<br>
                <a href="${verificationUrl}" style="color: #667eea; text-decoration: none; word-break: break-all;">
                  ${verificationUrl}
                </a>
              </p>

              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0 0 12px; color: #6b7280; font-size: 14px; line-height: 1.5;">
                  <strong>Note:</strong> This verification link will expire in 24 hours.
                </p>
                <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                  If you did not request this subscription, you can safely ignore this email.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; text-align: center; background: #f9fafb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Powered by <a href="https://supercheck.io" style="color: #667eea; text-decoration: none;">Supercheck</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

type WelcomeEmailParams = {
  statusPageName: string;
  statusPageUrl: string;
  unsubscribeUrl: string;
};

export function getWelcomeEmailTemplate(params: WelcomeEmailParams): {
  subject: string;
  text: string;
  html: string;
} {
  const { statusPageName, statusPageUrl, unsubscribeUrl } = params;

  const subject = `You're now subscribed to ${statusPageName}`;

  const text = `
Hello,

Your subscription to ${statusPageName} has been verified!

You will now receive email notifications about:
- Incidents and outages
- Scheduled maintenance
- Incident updates and resolutions

You can view the current status at any time: ${statusPageUrl}

To unsubscribe, click here: ${unsubscribeUrl}

---
Powered by Supercheck
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Confirmed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 32px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px 8px 0 0;">
              <div style="width: 48px; height: 48px; background: #ffffff; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                <span style="color: #10b981; font-size: 24px;">✓</span>
              </div>
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                You're All Set!
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.5;">
                Your subscription to <strong>${statusPageName}</strong> has been confirmed.
              </p>

              <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0 0 12px; color: #166534; font-size: 14px; font-weight: 600;">
                  You'll receive notifications for:
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #166534; font-size: 14px; line-height: 1.6;">
                  <li>Service incidents and outages</li>
                  <li>Scheduled maintenance windows</li>
                  <li>Incident updates and resolutions</li>
                </ul>
              </div>

              <p style="margin: 24px 0 0; color: #374151; font-size: 16px; line-height: 1.5;">
                You can view the current status at any time:
              </p>

              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${statusPageUrl}" style="display: inline-block; padding: 12px 24px; background: #f3f4f6; color: #374151; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                      View Status Page
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; text-align: center; background: #f9fafb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">
                Powered by <a href="https://supercheck.io" style="color: #667eea; text-decoration: none;">Supercheck</a>
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                <a href="${unsubscribeUrl}" style="color: #9ca3af; text-decoration: none;">Unsubscribe from these emails</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
