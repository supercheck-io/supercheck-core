"use client";
import { Skeleton } from "@/components/ui/skeleton";

// Skeleton Component
export function PlaygroundSkeleton() {
  // Use a default breadcrumb structure or omit it for the skeleton
  const skeletonBreadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Tests", href: "/tests" },
    { label: "Create Test", isCurrentPage: true },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* <PageBreadcrumbs items={skeletonBreadcrumbs} /> */} {/* Commented out as PageBreadcrumbs is not available here */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-background z-10 p-4 overflow-hidden">
          <div className="hidden h-full flex-col md:flex overflow-hidden">
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
      </div>
    </div>
  );
} 