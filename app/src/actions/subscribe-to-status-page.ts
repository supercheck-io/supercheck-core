"use server";

import { db } from "@/utils/db";
import { statusPages, statusPageSubscribers } from "@/db/schema/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { EmailService } from "@/lib/email-service";
import { getVerificationEmailTemplate } from "@/lib/email-templates/status-page-emails";
import { generateWebhookSecret } from "@/lib/webhook-utils";
import { generateProxyUrl } from "@/lib/asset-proxy";

const subscribeSchema = z.union([
  // Email subscription
  z.object({
    statusPageId: z.string().uuid(),
    email: z.string().email("Please enter a valid email address"),
    subscribeToAllComponents: z.boolean().default(true),
    selectedComponentIds: z.array(z.string().uuid()).optional(),
    subscriptionMode: z.literal("email").optional().default("email"),
  }),
  // Webhook subscription
  z.object({
    statusPageId: z.string().uuid(),
    endpoint: z.string().url("Please enter a valid webhook URL"),
    subscriptionMode: z.literal("webhook"),
    description: z.string().max(500).optional(),
    subscribeToAllComponents: z.boolean().default(true),
    selectedComponentIds: z.array(z.string().uuid()).optional(),
  }),
]);

type SubscribeInput = z.infer<typeof subscribeSchema>;

// Helper function to send verification email
async function sendVerificationEmail(params: {
  email: string;
  statusPageName: string;
  verificationToken: string;
  subdomain: string;
  statusPageLogo?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const emailService = EmailService.getInstance();

    // Construct verification URL
    // In production, this should use the actual domain
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const verificationUrl = `${baseUrl}/status-pages/verify/${params.verificationToken}`;

    const emailTemplate = getVerificationEmailTemplate({
      email: params.email,
      statusPageName: params.statusPageName,
      verificationUrl,
      statusPageLogo: params.statusPageLogo,
    });

    const result = await emailService.sendEmail({
      to: params.email,
      subject: emailTemplate.subject,
      text: emailTemplate.text,
      html: emailTemplate.html,
    });

    if (!result.success) {
      console.error("Failed to send verification email:", result.error);
      return { success: false, error: result.error };
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending verification email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

export async function subscribeToStatusPage(data: SubscribeInput) {
  try {
    // Validate input
    const validatedData = subscribeSchema.parse(data);

    // Check if status page exists and is published
    const statusPage = await db.query.statusPages.findFirst({
      where: eq(statusPages.id, validatedData.statusPageId),
    });

    if (!statusPage) {
      return {
        success: false,
        message: "Status page not found",
      };
    }

    if (statusPage.status !== "published") {
      return {
        success: false,
        message: "This status page is not currently accepting subscriptions",
      };
    }

    // Determine subscription mode and check permissions
    const mode = validatedData.subscriptionMode || "email";

    if (mode === "email" && !statusPage.allowEmailSubscribers) {
      return {
        success: false,
        message: "Email subscriptions are not enabled for this status page",
      };
    }

    if (mode === "webhook" && !statusPage.allowWebhookSubscribers) {
      return {
        success: false,
        message: "Webhook subscriptions are not enabled for this status page",
      };
    }

    // Handle email subscription
    if (mode === "email") {
      const emailData = validatedData as Extract<typeof validatedData, { subscriptionMode?: "email" }>;
      return await handleEmailSubscription(emailData, statusPage);
    }

    // Handle webhook subscription
    if (mode === "webhook") {
      const webhookData = validatedData as Extract<typeof validatedData, { subscriptionMode: "webhook" }>;
      return await handleWebhookSubscription(webhookData, statusPage);
    }

    return {
      success: false,
      message: "Invalid subscription mode",
    };
  } catch (error) {
    console.error("Error subscribing to status page:", error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: error.errors[0]?.message || "Invalid input",
      };
    }

    return {
      success: false,
      message: "An unexpected error occurred",
    };
  }
}

// Handle email subscription
async function handleEmailSubscription(
  data: Record<string, unknown>,
  statusPage: Record<string, unknown>
) {
  // Check if email is already subscribed
  const existingSubscriber = await db.query.statusPageSubscribers.findFirst({
    where: (subscribers, { and, eq }) =>
      and(
        eq(subscribers.statusPageId, statusPage.id as string),
        eq(subscribers.email, data.email as string)
      ),
  });

  if (existingSubscriber) {
    if (existingSubscriber.verifiedAt) {
      return {
        success: false,
        message: "This email is already subscribed to updates",
      };
    } else {
      // If exists but not verified, update the verification token and resend
      const newVerificationToken = randomBytes(32).toString("hex");
      const newUnsubscribeToken = randomBytes(32).toString("hex");

      await db
        .update(statusPageSubscribers)
        .set({
          verificationToken: newVerificationToken,
          unsubscribeToken: newUnsubscribeToken,
          updatedAt: new Date(),
        })
        .where(eq(statusPageSubscribers.id, existingSubscriber.id));

      // Send verification email
      const emailResult = await sendVerificationEmail({
        email: data.email as string,
        statusPageName: (statusPage.headline as string) || (statusPage.name as string),
        verificationToken: newVerificationToken,
        subdomain: statusPage.subdomain as string,
        statusPageLogo: statusPage.transactionalLogo ? generateProxyUrl(statusPage.transactionalLogo as string) : null,
      });

      if (!emailResult.success) {
        console.warn("Email sending failed but subscription updated:", emailResult.error);
      }

      return {
        success: true,
        message:
          "A new verification email has been sent. Please check your inbox.",
        requiresVerification: true,
      };
    }
  }

  // Generate secure tokens
  const verificationToken = randomBytes(32).toString("hex");
  const unsubscribeToken = randomBytes(32).toString("hex");

  // Create subscriber
  const [subscriber] = await db
    .insert(statusPageSubscribers)
    .values({
      statusPageId: statusPage.id as string,
      email: data.email as string,
      mode: "email",
      verificationToken,
      unsubscribeToken,
      skipConfirmationNotification: false,
      verifiedAt: null, // Will be set after verification
      createdAt: new Date(),
      updatedAt: new Date(),
    })
      .returning();

    // TODO: If specific components selected, create component subscriptions
    // if (!validatedData.subscribeToAllComponents && validatedData.selectedComponentIds) {
    //   await db.insert(statusPageComponentSubscriptions).values(
    //     validatedData.selectedComponentIds.map(componentId => ({
    //       subscriberId: subscriber.id,
    //       componentId,
    //       createdAt: new Date(),
    //     }))
    //   );
    // }

  // Send verification email
  const emailResult = await sendVerificationEmail({
    email: data.email as string,
    statusPageName: (statusPage.headline as string) || (statusPage.name as string),
    verificationToken,
    subdomain: statusPage.subdomain as string,
    statusPageLogo: statusPage.transactionalLogo ? generateProxyUrl(statusPage.transactionalLogo as string) : null,
  });

  if (!emailResult.success) {
    console.warn("Email sending failed but subscription created:", emailResult.error);
  }

  // Revalidate the public page
  revalidatePath(`/status-pages/${statusPage.id as string}/public`);

  return {
    success: true,
    message:
      "Subscription successful! Please check your email to verify your subscription.",
    requiresVerification: true,
    subscriberId: subscriber.id,
  };
}

// Handle webhook subscription
async function handleWebhookSubscription(
  data: Record<string, unknown>,
  statusPage: Record<string, unknown>
) {
  try {
    // Check if webhook already exists
    const existingSubscriber = await db.query.statusPageSubscribers.findFirst({
      where: (subscribers, { and, eq }) =>
        and(
          eq(subscribers.statusPageId, statusPage.id as string),
          eq(subscribers.endpoint, data.endpoint as string)
        ),
    });

    if (existingSubscriber && existingSubscriber.verifiedAt) {
      return {
        success: false,
        message: "This webhook endpoint is already subscribed to updates",
      };
    }

    // Delete old unverified webhook if exists
    if (existingSubscriber && !existingSubscriber.verifiedAt) {
      await db
        .update(statusPageSubscribers)
        .set({
          unsubscribeToken: randomBytes(32).toString("hex"),
          updatedAt: new Date(),
        })
        .where(eq(statusPageSubscribers.id, existingSubscriber.id));

      return {
        success: true,
        message: "Webhook subscription updated successfully",
        subscriberId: existingSubscriber.id,
      };
    }

    // Generate secure tokens
    const unsubscribeToken = randomBytes(32).toString("hex");
    const webhookSecret = generateWebhookSecret();

    // Create webhook subscriber (immediately verified - no email verification needed)
    const [subscriber] = await db
      .insert(statusPageSubscribers)
      .values({
        statusPageId: statusPage.id as string,
        endpoint: data.endpoint as string,
        mode: "webhook",
        unsubscribeToken,
        webhookSecret, // Persist the webhook secret for HMAC verification
        skipConfirmationNotification: false,
        verifiedAt: new Date(), // Webhooks are immediately verified
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // TODO: If specific components selected, create component subscriptions
    // if (!data.subscribeToAllComponents && data.selectedComponentIds) {
    //   await db.insert(statusPageComponentSubscriptions).values(
    //     data.selectedComponentIds.map(componentId => ({
    //       subscriberId: subscriber.id,
    //       componentId,
    //       createdAt: new Date(),
    //     }))
    //   );
    // }

    // Revalidate the public page
    revalidatePath(`/status-pages/${statusPage.id as string}/public`);

    return {
      success: true,
      message: "Webhook subscription successful! Your endpoint will receive incident notifications.",
      subscriberId: subscriber.id,
      webhookSecret, // Return secret for documentation purposes
    };
  } catch (error) {
    console.error("Error creating webhook subscription:", error);
    return {
      success: false,
      message: "Failed to create webhook subscription. Please try again later.",
    };
  }
}
