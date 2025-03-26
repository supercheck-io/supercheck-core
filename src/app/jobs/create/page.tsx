import CreateJob from "@/components/jobs/create-job";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

const breadcrumbs = [
  { label: "Home", href: "/" },
  { label: "Jobs", href: "/jobs" },
  { label: "Create", isCurrentPage: true },
];

export default function CreateJobPage() {
  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <CreateJob />
    </div>
  );
}
