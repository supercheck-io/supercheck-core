"use client";

import { notFound, useParams } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import EditJob from "@/components/jobs/edit-job";
import { getJob } from "@/actions/get-jobs";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
    { label: jobId.slice(0, 8) + "..", href: `/jobs/${jobId}`, isCurrentPage: true },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-full gap-2">
        <Loader2 className="h-12 w-12 animate-spin" />
        <p className="text-muted-foreground text-lg">Loading Job...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <PageBreadcrumbs items={breadcrumbs} />
      <EditJob jobId={jobId} />
    </div>
  );
}
