import { Runs } from "@/components/runs";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export const metadata = {
  title: "Test Runs",
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
      <Runs />
    </div>
  );
}
