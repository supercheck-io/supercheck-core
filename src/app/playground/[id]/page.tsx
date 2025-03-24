"use client";
import Playground from "@/components/playground";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { getTest } from "@/actions/get-test";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useParams } from "next/navigation";
import { TestPriority, TestType } from "@/db/schema";

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
  } | null>(null);
  
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Playground", href: "/playground" },
    { label: "Test", isCurrentPage: true },
  ];

  // Fetch test data and set loading state
  useEffect(() => {
    async function fetchTestData() {
      try {
        const result = await getTest(id);
        if (result.success && result.test) {
          setTestData(result.test);
        }
      } catch (error) {
        console.error("Error loading test:", error);
      } finally {
        // Set loading to false after a delay to ensure UI is ready
        setTimeout(() => {
          setIsLoading(false);
        }, 1500);
      }
    }
    
    fetchTestData();
  }, [id]);

  return (
    <div className="h-full">
      <PageBreadcrumbs items={breadcrumbs} />
      <div className="relative h-[calc(100vh-8rem)]">
        {isLoading ? (
          <div className="absolute inset-0 bg-background z-10">
            <div className="h-full">
              <div className="hidden h-full flex-col flex-1 md:flex p-4">
                <div className="flex h-full">
                  {/* Left panel - Editor */}
                  <div className="w-[70%] h-full flex flex-col border rounded-tl-lg rounded-bl-lg">
                    <div className="flex items-center justify-between border-b bg-muted px-4 py-2 rounded-tl-lg">
                      <Skeleton className="h-10 w-64" />
                      <Skeleton className="h-9 w-28" />
                    </div>
                    <div className="flex-1 overflow-hidden rounded-bl-lg">
                      <Skeleton className="h-full w-full" />
                    </div>
                  </div>
                  
                  {/* Resize handle */}
                  <div className="w-[10px] h-full bg-border flex items-center justify-center">
                    <div className="w-1 h-8 rounded-full bg-muted-foreground/20"></div>
                  </div>
                  
                  {/* Right panel - Test details */}
                  <div className="w-[calc(30%-10px)] h-full flex flex-col border rounded-tr-lg rounded-br-lg">
                    <div className="flex items-center justify-between border-b bg-muted px-4 py-2 rounded-tr-lg">
                      <Skeleton className="h-6 w-24" />
                    </div>
                    <div className="flex-1 overflow-auto p-4 space-y-4">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-32 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <div className={isLoading ? "opacity-0" : "opacity-100 transition-opacity duration-300"}>
          <Playground 
            initialTestId={id} 
            initialTestData={testData ? {
              id: testData.id,
              title: testData.title,
              description: testData.description || "", 
              script: testData.script,
              priority: testData.priority,
              type: testData.type
            } : undefined} 
          />
        </div>
      </div>
    </div>
  );
}
