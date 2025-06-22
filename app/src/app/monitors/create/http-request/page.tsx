import { Metadata } from "next";
import { TypedMonitorForm } from "@/components/monitors/typed-monitor-form";

export const metadata: Metadata = {
  title: "Create HTTP Request Monitor | Supercheck",
  description: "Create a new HTTP request monitor for API and endpoint monitoring",
};

export default function CreateHttpRequestMonitorPage() {
  return (
    <TypedMonitorForm
      monitorType="http_request"
      title="Create HTTP Request Monitor"
      description="Monitor API endpoints and web pages with full HTTP request customization including methods, headers, authentication, and response validation."
    />
  );
} 