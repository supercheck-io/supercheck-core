import { RunDetails } from "@/components/runs/run-details";
import { getRun } from "@/actions/get-runs";
import { notFound } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

interface RunPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RunPage({ params }: RunPageProps) {
  // Await the params object before accessing its properties
  const resolvedParams = await params;
  const run = await getRun(resolvedParams.id);
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Runs", href: "/runs" },
    { label: run?.id || "", isCurrentPage: true },
  ];

  if (!run) {
    notFound();
  }

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <RunDetails run={run} />
    </div>
  );
}
