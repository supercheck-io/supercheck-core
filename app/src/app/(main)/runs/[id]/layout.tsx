import { Metadata } from "next/types";

// Generate metadata with the run ID
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  return {
    title: `Run Details | Supercheck`,
    description: `View execution details and results for run`,
  };
}

export default function RunDetailsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
