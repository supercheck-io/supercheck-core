import { Metadata } from "next";
import { MonitorForm } from "@/components/monitors/monitor-form";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export const metadata: Metadata = {
  title: "Create Monitor | Supercheck",
  description: "Create a new monitor to track your service uptime",
};

const breadcrumbs = [
  { label: "Home", href: "/" },
  { label: "Monitors", href: "/monitors" },
  { label: "Create", isCurrentPage: true },
];

export default function CreateMonitorPage() {
  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <MonitorForm />
    </div>
  );
} 