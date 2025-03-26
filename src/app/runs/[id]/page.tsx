import { RunDetails } from "@/components/runs/run-details";
import { getRun } from "@/actions/get-runs";
import { notFound } from "next/navigation";

interface RunPageProps {
  params: {
    id: string;
  };
}

export async function generateMetadata({ params }: RunPageProps) {
  const run = await getRun(params.id);
  
  if (!run) {
    return {
      title: "Run Not Found",
      description: "The requested test run could not be found",
    };
  }
  
  return {
    title: `Run ${params.id.slice(0, 8)}`,
    description: `Details for test run ${params.id}`,
  };
}

export default async function RunPage({ params }: RunPageProps) {
  const run = await getRun(params.id);
  
  if (!run) {
    notFound();
  }
  
  return <RunDetails run={run} />;
}
