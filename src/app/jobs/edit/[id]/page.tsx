"use client";
import { useParams } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import EditJob from "@/components/jobs/edit-job";

export default function EditJobPage() {
  const params = useParams();
  const jobId = params.id as string;
  
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Jobs", href: "/jobs" },
    { label: "Edit", isCurrentPage: true },
    { label: jobId, href: `/jobs/${jobId}`, isCurrentPage: true },
  ];

  return (
    <div className="container mx-auto p-4 space-y-4">
      <PageBreadcrumbs items={breadcrumbs} />
      <EditJob jobId={jobId} />
    </div>
  );
}
