"use client";
import Playground from "@/components/playground";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { getTest } from "@/actions/get-test";
import { useEffect, useState } from "react";
import { useParams, notFound } from "next/navigation";
import { TestPriority, TestType } from "@/db/schema/schema";
import { PlaygroundSkeleton } from "@/components/playground/playground-skeleton";

// Converting to a client component
export default function PlaygroundPage() {
  const params = useParams();
  const id = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [testData, setTestData] = useState<{
    id: string;
    title: string;
    description: string | null;
    script: string;
    priority: TestPriority;
    type: TestType;
    updatedAt?: string | null;
    createdAt?: string | null;
  } | null>(null);

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Playground", href: "/playground" },
    { label: "Tests", href: "/tests" },
    { label: "Edit", isCurrentPage: true },
  ];

  // Fetch test data and set loading state
  useEffect(() => {
    async function fetchTestData() {
      try {
        const result = await getTest(id);
        if (result.success && result.test) {
          setTestData({
            ...result.test,
            updatedAt: result.test.updatedAt ? result.test.updatedAt.toISOString() : null,
            createdAt: result.test.createdAt ? result.test.createdAt.toISOString() : null,
          });
        } else {
          // Test not found or error, trigger the not-found page
          notFound();
        }
      } catch (error) {
        console.error("Error loading test:", error);
        notFound();
      } finally {
        // Set loading to false after a delay to ensure UI is ready
        setTimeout(() => {
          setIsLoading(false);
        }, 1500);
      }
    }

    fetchTestData();
  }, [id]);

  // If no test data is available and we're done loading, don't try to render the playground
  if (!isLoading && !testData) {
    notFound();
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      <PageBreadcrumbs items={breadcrumbs} />
      <div className="relative flex-1 overflow-hidden">
        {isLoading && <PlaygroundSkeleton />}
        <div
          className={
            isLoading
              ? "opacity-0"
              : "opacity-100 transition-opacity duration-300"
          }
        >
          {testData && (
            <Playground
              initialTestId={id}
              initialTestData={{
                id: testData.id,
                title: testData.title,
                description: testData.description || "",
                script: testData.script,
                priority: testData.priority,
                type: testData.type,
                updatedAt: testData.updatedAt || undefined,
                createdAt: testData.createdAt || undefined,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
