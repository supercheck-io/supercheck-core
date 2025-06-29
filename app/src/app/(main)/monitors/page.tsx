import MonitorsList from "@/components/monitors/monitors-list";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

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