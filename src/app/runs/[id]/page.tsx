import { RunDetails } from "@/components/runs/run-details";
import { getRun } from "@/actions/get-runs";
import { notFound } from "next/navigation";

interface RunPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RunPage({ params }: RunPageProps) {
  // Await the params object before accessing its properties
  const resolvedParams = await params;
  const run = await getRun(resolvedParams.id);

  if (!run) {
    notFound();
  }

  return <RunDetails run={run} />;
}
