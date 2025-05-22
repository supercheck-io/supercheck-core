import { RunDetails } from "@/components/runs/run-details";
import { getRun } from "@/actions/get-runs";
import { notFound } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type Params = {
  params: {
    id: string
  }
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
  const { id } = params;
  const run = await getRun(id);
  
  if (!run) {
    notFound();
  }
  
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Runs", href: "/runs" },
    { label: run.id.slice(0, 8) + "..", isCurrentPage: true },
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
