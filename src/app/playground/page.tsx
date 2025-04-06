"use client";
import Playground from "@/components/playground";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { useSearchParams } from 'next/navigation';
import React, { useState, useEffect, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Function to generate breadcrumbs based on scriptType
const getBreadcrumbs = (scriptType: string | null) => {
  let testTypeLabel = "Test"; // Default label

  switch (scriptType) {
    case "browser":
      testTypeLabel = "Browser Test";
      break;
    case "api":
      testTypeLabel = "API Test";
      break;
    case "multistep":
      testTypeLabel = "Multi-step Test";
      break;
    case "database":
      testTypeLabel = "Database Test";
      break;
    // Add more cases if needed
  }

  return [
    { label: "Home", href: "/" },
    { label: "Tests", href: "/tests" },
    { label: `Create ${testTypeLabel}`, isCurrentPage: true },
  ];
};

// Skeleton Component
function PlaygroundSkeleton() {
  // Use a default breadcrumb structure or omit it for the skeleton
  const skeletonBreadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Tests", href: "/tests" },
    { label: "Create Test", isCurrentPage: true },
  ];

  return (
    <div className="h-full">
      <PageBreadcrumbs items={skeletonBreadcrumbs} />
      <div className="relative h-[calc(100vh-8rem)]">
        <div className="absolute inset-0 bg-background z-10 p-4">
          <div className="hidden h-full flex-col md:flex">
            <div className="flex h-full">
              <div className="w-[70%] h-full flex flex-col border rounded-tl-lg rounded-bl-lg">
                <div className="flex items-center justify-between border-b bg-muted px-4 py-2 rounded-tl-lg">
                  <Skeleton className="h-10 w-64" />
                  <Skeleton className="h-9 w-28" />
                </div>
                <div className="flex-1 overflow-hidden rounded-bl-lg">
                  <Skeleton className="h-full w-full" />
                </div>
              </div>
              <div className="w-[10px] h-full bg-border flex items-center justify-center">
                <div className="w-1 h-8 rounded-full bg-muted-foreground/20"></div>
              </div>
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
    </div>
  );
}

// Client Boundary Component
function PlaygroundClientBoundary() {
  const searchParams = useSearchParams();
  const scriptType = searchParams.get('scriptType');
  const [isLoading, setIsLoading] = useState(true);

  const breadcrumbs = getBreadcrumbs(scriptType);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500); // Keep the loading timer

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="h-full">
      <PageBreadcrumbs items={breadcrumbs} />
      <div className="relative h-[calc(100vh-8rem)]">
        {/* Show skeleton only if isLoading is true */}
        {isLoading && <PlaygroundSkeleton />} 
        {/* Actual Playground content with transition */}
        <div
          className={cn(
            "transition-opacity duration-300 h-full",
            isLoading ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
        >
          {/* Suspense around Playground might still be needed if Playground uses client hooks */}
          <Suspense fallback={<div>Loading Playground Component...</div>}> 
            <Playground />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  // No useSearchParams or client logic here
  return (
    <Suspense fallback={<PlaygroundSkeleton />}>
      <PlaygroundClientBoundary />
    </Suspense>
  );
}
