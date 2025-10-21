"use server";

import { db } from "@/utils/db";
import {
  incidents,
  statusPages,
  statusPageSubscribers,
  incidentComponents,
} from "@/db/schema/schema";
import { eq, and } from "drizzle-orm";
import { EmailService } from "@/lib/email-service";
import { getIncidentNotificationEmailTemplate } from "@/lib/email-templates/status-page-emails";
import { format } from "date-fns";
import { generateProxyUrl } from "@/lib/asset-proxy";

/**
 * Send incident notification emails to all verified subscribers
 * This is called after an incident is created or updated
 */
export async function sendIncidentNotifications(
  incidentId: string,
  statusPageId: string
) {
  try {
    console.log(
      `[Incident Notifications] Sending notifications for incident ${incidentId} on status page ${statusPageId}`
    );

    // Fetch incident details
    const incident = await db.query.incidents.findFirst({
      where: eq(incidents.id, incidentId),
    });

    if (!incident) {
      console.warn(
        `[Incident Notifications] Incident not found: ${incidentId}`
      );
      return {
        success: false,
        message: "Incident not found",
        sentCount: 0,
      };
    }

    // Check if notifications should be sent
    if (!incident.deliverNotifications) {
      console.log(
        `[Incident Notifications] Notifications disabled for incident ${incidentId}`
      );
      return {
        success: true,
        message: "Notifications disabled for this incident",
        sentCount: 0,
      };
    }

    // Fetch status page details
    const statusPage = await db.query.statusPages.findFirst({
      where: eq(statusPages.id, statusPageId),
    });

    if (!statusPage) {
      console.warn(
        `[Incident Notifications] Status page not found: ${statusPageId}`
      );
      return {
        success: false,
        message: "Status page not found",
        sentCount: 0,
      };
    }

    // Check if email subscriptions are enabled
    if (!statusPage.allowEmailSubscribers) {
      console.log(
        `[Incident Notifications] Email subscriptions disabled for status page ${statusPageId}`
      );
      return {
        success: true,
        message: "Email subscriptions not enabled for this status page",
        sentCount: 0,
      };
    }

    // Get affected components
    const affectedComponentsRecords = await db.query.incidentComponents.findMany({
      where: eq(incidentComponents.incidentId, incidentId),
      with: {
        component: {
          columns: {
            name: true,
          },
        },
      },
    });

    const affectedComponents = affectedComponentsRecords.map(
      (ic) => ic.component?.name || "Unknown Component"
    );

    // Get all verified subscribers for this status page
    const subscribers = await db.query.statusPageSubscribers.findMany({
      where: and(
        eq(statusPageSubscribers.statusPageId, statusPageId),
        eq(statusPageSubscribers.mode, "email")
      ),
    });

    // Filter verified subscribers (have verifiedAt timestamp)
    const verifiedSubscribers = subscribers.filter((s) => s.verifiedAt !== null);

    if (verifiedSubscribers.length === 0) {
      console.log(
        `[Incident Notifications] No verified email subscribers for status page ${statusPageId}`
      );
      return {
        success: true,
        message: "No verified subscribers to notify",
        sentCount: 0,
      };
    }

    console.log(
      `[Incident Notifications] Found ${verifiedSubscribers.length} verified subscribers`
    );

    // Construct notification URLs
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
    const statusPageUrl = `${baseUrl}/status-pages/${statusPageId}/public`;

    // Build email parameters
    const formatIncidentTimestamp = (date: Date | null) => {
      return date ? format(date, "PPpp") : "Just now";
    };

    const emailParams = {
      statusPageName: statusPage.name,
      statusPageUrl,
      incidentName: incident.name,
      incidentStatus: incident.status,
      incidentImpact: incident.impact,
      incidentDescription: incident.body || "No additional details provided.",
      affectedComponents,
      updateTimestamp: formatIncidentTimestamp(incident.createdAt),
      unsubscribeUrl: `${baseUrl}/status-pages/${statusPageId}/public/unsubscribe`, // Placeholder - implement unsubscribe action
      statusPageLogo: statusPage.transactionalLogo ? generateProxyUrl(statusPage.transactionalLogo as string) : null,
    };

    // Send emails to all subscribers
    const emailService = EmailService.getInstance();
    let successCount = 0;
    let failureCount = 0;

    const sendPromises = verifiedSubscribers.map(async (subscriber) => {
      try {
        if (!subscriber.email) {
          console.warn(
            `[Incident Notifications] Subscriber ${subscriber.id} has no email address`
          );
          failureCount++;
          return;
        }

        const { subject, text, html } =
          getIncidentNotificationEmailTemplate(emailParams);

        const result = await emailService.sendEmail({
          to: subscriber.email,
          subject,
          text,
          html,
        });

        if (result.success) {
          console.log(
            `[Incident Notifications] Email sent successfully to ${subscriber.email}`
          );
          successCount++;
        } else {
          console.error(
            `[Incident Notifications] Failed to send email to ${subscriber.email}: ${result.error}`
          );
          failureCount++;
        }
      } catch (error) {
        console.error(
          `[Incident Notifications] Error sending email to subscriber:`,
          error
        );
        failureCount++;
      }
    });

    // Wait for all emails to be sent
    await Promise.allSettled(sendPromises);

    const message =
      failureCount === 0
        ? `Successfully sent ${successCount} notification emails`
        : `Sent ${successCount} emails successfully, ${failureCount} failed`;

    console.log(`[Incident Notifications] ${message}`);

    return {
      success: failureCount === 0,
      message,
      sentCount: successCount,
      failedCount: failureCount,
    };
  } catch (error) {
    console.error("[Incident Notifications] Fatal error:", error);
    return {
      success: false,
      message: `Failed to send incident notifications: ${
        error instanceof Error ? error.message : String(error)
      }`,
      sentCount: 0,
      error,
    };
  }
}
