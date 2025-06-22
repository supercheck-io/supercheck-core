import { Metadata } from "next";
import { TypedMonitorForm } from "@/components/monitors/typed-monitor-form";

export const metadata: Metadata = {
  title: "Create Website Monitor | Supercheck",
  description: "Create a new website monitor for simple availability checking",
};

export default function CreateWebsiteMonitorPage() {
  return (
    <TypedMonitorForm
      monitorType="website"
      title="Create Website Monitor"
      description="Simple website monitoring with GET requests to check availability, response times, and basic content validation."
    />
  );
} 