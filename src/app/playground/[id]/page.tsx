import Playground from "@/components/playground";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { getTest } from "@/actions/get-test";

// Define the props type for the page component
interface PlaygroundPageProps {
  params: {
    id: string;
  };
}

// In Next.js App Router, page components can be async
export default async function PlaygroundPage({ params }: PlaygroundPageProps) {
  // Ensure params is properly awaited
  const { id } = await params;
  
  // Fetch the test data
  const testData = await getTest(id);
  
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Playground", href: "/playground" },
    { label: "Test", isCurrentPage: true },
  ];

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <Playground 
        initialTestId={id} 
        initialTestData={testData.success && testData.test ? {
          id: testData.test.id,
          title: testData.test.title,
          description: testData.test.description || "", 
          script: testData.test.script,
          priority: testData.test.priority,
          type: testData.test.type
        } : undefined} 
      />
    </div>
  );
}
