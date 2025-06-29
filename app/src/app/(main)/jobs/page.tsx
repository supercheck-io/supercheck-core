import Jobs from "@/components/jobs";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export default function JobsPage() {
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Jobs", isCurrentPage: true },
  ];
  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <Jobs />
    </div>
  );
} 