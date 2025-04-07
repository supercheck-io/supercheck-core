import Jobs from "@/components/jobs";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { JobProvider } from "@/components/jobs/job-context";

export async function generateMetadata() {
  return {
    title: "Supertest | Jobs",
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
      <JobProvider>
        <Jobs />
      </JobProvider>
    </div>
  );
}
