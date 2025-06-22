import { Metadata } from "next";
import { MonitorForm, type FormValues } from "@/components/monitors/monitor-form";
import { Monitor } from "@/components/monitors/schema";
import { notFound } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export const metadata: Metadata = {
  title: "Edit Monitor | Supercheck",
  description: "Edit your monitor configuration",
};

async function fetchMonitor(id: string): Promise<Monitor | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/monitors/${id}`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch monitor: ${response.statusText}`);
    }
    
    const monitor = await response.json();
    return monitor;
  } catch (error) {
    console.error("Error fetching monitor:", error);
    return null;
  }
}

export default async function EditMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const monitor = await fetchMonitor(id);

  if (!monitor) {
    notFound();
  }

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Monitors", href: "/monitors" },
    { label: monitor.name, href: `/monitors/${id}` },
    { label: "Edit", isCurrentPage: true },
  ];

  // Map Monitor.type to FormValues.type
  let formType: FormValues["type"];
  const currentType = monitor.type;

  // Check if monitor.type is directly one of the FormValues types
  const formValueTypes = ["http_request", "website", "ping_host", "port_check", "heartbeat"] as const;
  
  if ((formValueTypes as readonly string[]).includes(currentType)) {
    formType = currentType as FormValues["type"];
  } else {
    // Handle cases where Monitor.type needs mapping (e.g., old "get"/"post" to "http_request")
    // Or if it's an unmapped but valid Monitor.type
    switch (currentType) {
      case "get": // Example if Monitor schema could have "get"
      case "post": // Example if Monitor schema could have "post"
        formType = "http_request";
        console.warn(`Monitor type '${currentType}' mapped to form type 'http_request'.`);
        break;
      // Add other specific mappings here if necessary
      default:
        // Fallback for valid Monitor types not directly usable or mapped
        console.warn(`Unmapped monitor type '${currentType}' for direct FormValues type. Defaulting to http_request.`);
        formType = "http_request";
        break;
    }
  }

  // Convert monitor.frequencyMinutes to FormValues.interval (seconds as string)
  const validFormIntervals = ["60", "300", "600", "900", "1800", "3600", "10800", "43200", "86400"];
  let formInterval: FormValues["interval"] = "60"; // Default interval
  
  // Convert frequencyMinutes to seconds
  const intervalInSeconds = (monitor.frequencyMinutes || 1) * 60;
  if (validFormIntervals.includes(intervalInSeconds.toString())) {
    formInterval = intervalInSeconds.toString() as FormValues["interval"];
  } else {
    console.warn(`Monitor frequency ${monitor.frequencyMinutes} minutes (${intervalInSeconds} seconds) not in form options. Defaulting to 60s.`);
  }

  // Prepare data for the form, ensuring all required fields for FormValues are present
  const formData: FormValues = {
    name: monitor.name,
    target: monitor.url || "", 
    type: formType,
    interval: formInterval,
    httpConfig_authType: monitor.config?.auth?.type || "none",

    // HTTP specific fields
    httpConfig_method: formType === "http_request" ? (monitor.config?.method || "GET") : undefined,
    httpConfig_expectedStatusCodes: (formType === "http_request" || formType === "website") ? (monitor.config?.expectedStatusCodes || "2xx") : undefined,
    httpConfig_headers: formType === "http_request" && monitor.config?.headers ? JSON.stringify(monitor.config.headers, null, 2) : undefined,
    httpConfig_body: formType === "http_request" ? monitor.config?.body : undefined,
    httpConfig_keywordInBody: (formType === "http_request" || formType === "website") ? monitor.config?.keywordInBody : undefined,
    httpConfig_keywordShouldBePresent: (formType === "http_request" || formType === "website") ? monitor.config?.keywordInBodyShouldBePresent : undefined,
    
    // Auth fields
    httpConfig_authUsername: monitor.config?.auth?.username,
    httpConfig_authPassword: monitor.config?.auth?.password,
    httpConfig_authToken: monitor.config?.auth?.token,

    // Port Check specific
    portConfig_port: formType === "port_check" && monitor.config?.port ? monitor.config.port : undefined,
    portConfig_protocol: formType === "port_check" && monitor.config?.protocol ? monitor.config.protocol : undefined,

    // Heartbeat specific
    heartbeatConfig_expectedInterval: formType === "heartbeat" && monitor.config?.expectedIntervalMinutes ? monitor.config.expectedIntervalMinutes : undefined,
    heartbeatConfig_gracePeriod: formType === "heartbeat" && monitor.config?.gracePeriodMinutes ? monitor.config.gracePeriodMinutes : undefined,

    // Website SSL specific
    websiteConfig_enableSslCheck: formType === "website" && monitor.config?.enableSslCheck ? monitor.config.enableSslCheck : undefined,
    websiteConfig_sslDaysUntilExpirationWarning: formType === "website" && monitor.config?.sslDaysUntilExpirationWarning ? monitor.config.sslDaysUntilExpirationWarning : undefined,
  };

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <MonitorForm 
        initialData={formData} 
        editMode={true} 
        id={id} 
      />
    </div>
  );
} 