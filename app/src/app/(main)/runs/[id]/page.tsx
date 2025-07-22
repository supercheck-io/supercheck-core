import { RunDetails } from "@/components/runs/run-details";
// import { getRun } from "@/actions/get-runs"; // Replaced with API call
import { notFound } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type Params = {
  params: Promise<{
    id: string
  }>
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-24" />
      </div>
      <Skeleton className="h-[300px] w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}

export default async function RunPage({ params }: Params) {
  const { id } = await params;
  
  // Fetch run data from API
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/runs/${id}`, {
    cache: 'no-store'
  });
  
  if (!response.ok) {
    notFound();
  }
  
  const run = await response.json();
  
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Runs", href: "/runs" },
    { label: run.jobName && run.jobName.length > 20 ? `${run.jobName.substring(0, 20)}...` : run.jobName || id, href: `/jobs?job=${run.jobId}` },
    { label: "Report", isCurrentPage: true },
  ];

  return (
    <div className="w-full max-w-full">
      <PageBreadcrumbs items={breadcrumbs} />
      <Suspense fallback={<DetailSkeleton />}>
        <RunDetails run={run} />
      </Suspense>
    </div>
  );
}
