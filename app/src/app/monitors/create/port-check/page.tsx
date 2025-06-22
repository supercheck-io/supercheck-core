import { Metadata } from "next";
import { TypedMonitorForm } from "@/components/monitors/typed-monitor-form";

export const metadata: Metadata = {
  title: "Create Port Check Monitor | Supercheck",
  description: "Create a new port monitor for TCP/UDP service monitoring",
};

export default function CreatePortCheckMonitorPage() {
  return (
    <TypedMonitorForm
      monitorType="port_check"
      title="Create Port Check Monitor"
      description="Monitor TCP and UDP ports to ensure services are accessible and responding on specific network ports."
    />
  );
} 