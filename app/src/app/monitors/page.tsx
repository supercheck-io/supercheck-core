import { Metadata } from "next";
import MonitorsList from "@/components/monitors/monitors-list";

import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export const metadata: Metadata = {
  title: "Monitors | Supercheck",
  description: "Monitor your URLs and services with uptime checks",
};

export default function MonitorsPage() {
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Monitors", isCurrentPage: true },
  ];

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
        <MonitorsList />
    </div>
  );
} 