import Jobs from "@/components/jobs";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { JobProvider } from "@/components/jobs/job-context";

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
