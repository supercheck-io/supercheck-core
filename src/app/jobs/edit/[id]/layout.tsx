import { Metadata } from "next/types";

// Generate metadata with the job ID
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  return {
    title: `Supertest | Edit Job ${resolvedParams.id}`,
    description: `Edit configuration for job #${resolvedParams.id}`,
  };
}

export default function EditJobIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
