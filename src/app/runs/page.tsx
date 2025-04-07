import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { RunsClient } from "@/components/runs/runs-client";

export const metadata = {
  title: "Supertest | Runs",
  description: "View and manage all test run executions",
};

export default function RunsPage() {
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Runs", isCurrentPage: true },
  ];

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <RunsClient />
    </div>
  );
}
