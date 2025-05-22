import { Suspense } from "react";
import { Metadata } from "next";
import { Monitor } from "@/components/monitors/schema";
import { MonitorDetailClient } from "@/components/monitors/monitor-detail-client";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

type Params = {
  params: {
    id: string
  }
}

export async function generateMetadata({ 
  params 
}: Params): Promise<Metadata> {
  const id = params.id;
  
  return {
    title: "Monitor Details | Supercheck",
    description: `View and manage monitor ${id.slice(0, 8)}`,
  };
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-24" />
      </div>
      <Skeleton className="h-[300px] w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}

// We'll use this in the future when connecting to a real API
// For now, using mock data below
// async function fetchMonitor(id: string): Promise<Monitor | null> {
//   try {
//     const response = await fetch(`http://localhost:3000/api/monitors/${id}`, { 
//       cache: "no-cache"
//     });
//     
//     if (!response.ok) {
//       throw new Error(`Failed to fetch monitor: ${response.statusText}`);
//     }
//     
//     return await response.json();
//   } catch (error) {
//     console.error("Error fetching monitor:", error);
//     return null;
//   }
// }

export default function MonitorDetailsPage({ 
  params 
}: Params) {
  const id = params.id;
  
  // Define breadcrumbs
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Monitors", href: "/monitors" },
    { label: id.slice(0, 8) + "..", isCurrentPage: true },
  ];

  // For now, we'll use mock data, but in a real app, we would fetch from API
  const monitor: Monitor = {
    id: id,
    name: "Example Monitor",
    url: "https://example.com/api/status",
    method: "get",
    status: "up",
    interval: 60,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastCheckedAt: new Date(Date.now() - 120000).toISOString(),
    responseTime: 342,
    uptime: 99.98,
  };

  return (
    <div className="w-full max-w-full">
      <PageBreadcrumbs items={breadcrumbs} />
      <Suspense fallback={<DetailSkeleton />}>
        <MonitorDetailClient monitor={monitor} />
      </Suspense>
    </div>
  );
} 