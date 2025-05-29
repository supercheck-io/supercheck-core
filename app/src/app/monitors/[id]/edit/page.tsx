import { Metadata } from "next";
import { MonitorForm, type FormValues } from "@/components/monitors/monitor-form";
import { Monitor, monitorSchema } from "@/components/monitors/schema";
import { notFound } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export const metadata: Metadata = {
  title: "Edit Monitor | Supercheck",
  description: "Edit your monitor configuration",
};

async function fetchMonitor(id: string): Promise<Monitor | null> {
  try {
    // Mock data should align with the 'Monitor' type from schema.ts
    // And provide fields that will be transformed into 'FormValues' for the form.
    return {
      id,
      name: "Example HTTP Monitor",
      url: "https://example.com/api/status", // Used for 'target' in form
      method: "http_request", // Valid 'Monitor' method, maps to 'type' in form
      status: "up",
      interval: 300, // number, will be converted to string for form
      active: true,
      // Mock other fields from 'Monitor' schema as needed or if they might be used
      // e.g., expectedStatus for an http_request type monitor
      expectedStatus: 200,
    };
  } catch (error) {
    console.error("Error fetching monitor:", error);
    return null;
  }
}

export default async function EditMonitorPage({ params }: { params: { id: string } }) {
  const { id } = params;
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

  // Map Monitor.method to FormValues.type
  let formType: FormValues["type"];
  const currentMethod = monitor.method;

  // Check if monitor.method is directly one of the FormValues types
  const formValueTypes = ["http_request", "ping_host", "port_check", "dns_check", "playwright_script"] as const;
  
  if ((formValueTypes as readonly string[]).includes(currentMethod)) {
    formType = currentMethod as FormValues["type"];
  } else {
    // Handle cases where Monitor.method needs mapping (e.g., old "get"/"post" to "http_request")
    // Or if it's an unmapped but valid Monitor.method
    switch (currentMethod) {
      case "get": // Example if Monitor schema could have "get"
      case "post": // Example if Monitor schema could have "post"
        formType = "http_request";
        console.warn(`Monitor method '${currentMethod}' mapped to form type 'http_request'.`);
        break;
      // Add other specific mappings here if necessary
      default:
        // Fallback for valid Monitor methods not directly usable or mapped
        const parseResult = monitorSchema.shape.method.safeParse(currentMethod);
        if (!parseResult.success) {
          console.error(`Invalid monitor method '${currentMethod}' found.`);
          notFound(); 
        }
        console.warn(`Unmapped monitor method '${currentMethod}' for direct FormValues type. Defaulting to http_request.`);
        formType = "http_request";
        break;
    }
  }

  // Convert monitor.interval (number) to FormValues.interval (string enum)
  const validFormIntervals = ["30", "60", "300", "600", "900", "1800", "3600", "10800", "43200", "86400"];
  let formInterval: FormValues["interval"] = "60"; // Default interval
  if (validFormIntervals.includes(monitor.interval.toString())) {
    formInterval = monitor.interval.toString() as FormValues["interval"];
  } else {
    console.warn(`Monitor interval '${monitor.interval}' not in form options. Defaulting to 60s.`);
  }

  // Prepare data for the form, ensuring all required fields for FormValues are present
  const formData: FormValues = {
    name: monitor.name,
    target: monitor.url, 
    type: formType,
    interval: formInterval,
    httpConfig_authType: "none", // Default as per formSchema

    // Optional fields from Monitor that map to FormValues fields
    // HTTP specific (only if formType is http_request)
    httpConfig_method: formType === "http_request" && (monitor.method === "http_request" || ["get", "post", "put", "delete", "patch", "head", "options"].includes(monitor.method)) 
        ? (monitor.method === "http_request" ? "GET" : monitor.method.toUpperCase() as FormValues["httpConfig_method"]) 
        : undefined, // Or a default like "GET"
    httpConfig_expectedStatusCode: monitor.expectedStatus,

    // Ensure other potentially required fields based on 'type' are considered
    // e.g. portConfig_port if type is "port_check"
    // For now, only populating based on the mock 'http_request' monitor
    portConfig_port: formType === "port_check" && monitor.port ? monitor.port : undefined,
    // dnsConfig_recordType: ..., (if type is dns_check)
    // playwrightConfig_testId: ..., (if type is playwright_script)
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