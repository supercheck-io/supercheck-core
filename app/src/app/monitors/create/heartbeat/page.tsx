import { Metadata } from "next";
import { TypedMonitorForm } from "@/components/monitors/typed-monitor-form";

export const metadata: Metadata = {
  title: "Create Heartbeat Monitor | Supercheck",
  description: "Create a new heartbeat monitor for passive monitoring of scheduled jobs",
};

export default function CreateHeartbeatMonitorPage() {
  return (
    <TypedMonitorForm
      monitorType="heartbeat"
      title="Create Heartbeat Monitor"
      description="Passive monitoring that expects regular pings from your services, cron jobs, scheduled tasks, or backup scripts. Perfect for monitoring critical background processes."
    />
  );
} 