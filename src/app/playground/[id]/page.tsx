"use client";
import Playground from "@/components/playground";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { getTest } from "@/actions/get-test";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams, notFound } from "next/navigation";
import { TestPriority, TestType } from "@/db/schema";

// Skeleton Component
function PlaygroundSkeleton() {
  return (
    <div className="absolute inset-0 bg-background z-10 p-4">
      <div className="hidden h-full flex-col md:flex">
        <div className="flex h-full">
          <div className="w-[70%] h-full flex flex-col border rounded-tl-lg rounded-bl-lg">
            <div className="flex items-center justify-between border-b bg-card px-4 py-2 rounded-tl-lg">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-9 w-28" />
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="h-full w-full p-4 bg-card/30 flex flex-col gap-4">
                <Skeleton className="h-5 w-3/4 mt-10" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-5/6" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-5 w-3/5" />
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            </div>
          </div>
          <div className="w-[10px] h-full bg-border flex items-center justify-center">
            <div className="w-1 h-8 rounded-full bg-muted-foreground/20"></div>
          </div>
          <div className="w-[calc(30%-10px)] h-full flex flex-col border rounded-tr-lg rounded-br-lg">
            <div className="flex items-center justify-between border-b bg-card px-4 py-2 rounded-tr-lg">
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    { label: "Test", href: "/tests" },
    { label: id, isCurrentPage: true },
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
    <div className="h-full">
      <PageBreadcrumbs items={breadcrumbs} />
      <div className="relative h-[calc(100vh-8rem)]">
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
