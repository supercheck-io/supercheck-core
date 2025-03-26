import { RunDetails } from "@/components/runs/run-details";
import { getRun } from "@/actions/get-runs";
import { notFound } from "next/navigation";

interface RunPageProps {
  params: {
    id: string;
  };
}

export async function generateMetadata({ params }: RunPageProps) {
  // Await the params object before accessing its properties
  const resolvedParams = await Promise.resolve(params);
  const run = await getRun(resolvedParams.id);
  
  if (!run) {
    return {
      title: "Run Not Found",
      description: "The requested test run could not be found",
    };
  }
  
  return {
    title: `Test Run Details`,
    description: `Details for test run ${run.id}`,
  };
}

export default async function RunPage({ params }: RunPageProps) {
  // Await the params object before accessing its properties
  const resolvedParams = await Promise.resolve(params);
  const run = await getRun(resolvedParams.id);
  
  if (!run) {
    notFound();
  }
  
  return <RunDetails run={run} />;
}
