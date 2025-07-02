"use client";

import { notFound, useParams } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import EditJob from "@/components/jobs/edit-job";
import { getJob } from "@/actions/get-jobs";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { EditJobSkeleton } from "@/components/jobs/edit-job-skeleton";

export default function EditJobPage() {
  const params = useParams();
  const jobId = params.id as string;
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    async function checkJobExists() {
      try {
        const response = await getJob(jobId);
        if (!response.success || !response.job) {
          notFound();
        }
      } catch (error) {
        console.error("Error checking job:", error);
        notFound();
      } finally {
        setIsLoading(false);
      }
    }
    
    checkJobExists();
  }, [jobId]);
  
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Jobs", href: "/jobs" },
    { label: "Edit", isCurrentPage: true },
    
  ];

  if (isLoading) {
    return (
      <div className=" mx-auto p-4 space-y-4">
        <PageBreadcrumbs items={breadcrumbs} />
        <EditJobSkeleton />
      </div>
    );
  }

  return (
    <div className=" mx-auto p-4 space-y-4">
      <PageBreadcrumbs items={breadcrumbs} />
      <EditJob jobId={jobId} />
    </div>
  );
}
