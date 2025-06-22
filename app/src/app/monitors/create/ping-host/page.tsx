import { Metadata } from "next";
import { TypedMonitorForm } from "@/components/monitors/typed-monitor-form";

export const metadata: Metadata = {
  title: "Create Ping Host Monitor | Supercheck",
  description: "Create a new ping monitor for network connectivity testing",
};

export default function CreatePingHostMonitorPage() {
  return (
    <TypedMonitorForm
      monitorType="ping_host"
      title="Create Ping Host Monitor"
      description="Monitor network connectivity using ICMP ping packets to verify host availability and measure response times."
    />
  );
} 