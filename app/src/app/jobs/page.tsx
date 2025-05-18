import Jobs from "@/components/jobs";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export async function generateMetadata() {
  return {
    title: "Supercheck | Jobs",
    description: "View and manage all test jobs",
  };
}

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
