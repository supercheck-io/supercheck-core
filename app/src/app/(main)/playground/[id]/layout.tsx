import { Metadata } from "next/types";

// Generate metadata with the test ID
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  return {
    title: `Playground | Supercheck`,
    description: `Edit and run test script`,
  };
}

export default function PlaygroundIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
