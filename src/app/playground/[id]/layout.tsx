import { Metadata } from "next/types";

// Generate metadata with the test ID
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  return {
    title: `Supertest | Playground ${resolvedParams.id}`,
    description: `Edit and run test script ${resolvedParams.id}`,
  };
}

export default function PlaygroundIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
