import { Suspense } from "react";
import { Metadata } from "next";
// MonitorSchemaType is used by MonitorDetailClient, keep if that prop type remains
// import { Monitor as MonitorSchemaType } from "@/components/monitors/schema"; 
import { MonitorDetailClient, MonitorWithResults, MonitorResultItem } from "@/components/monitors/monitor-detail-client";
import { Monitor as MonitorSchemaType } from "@/components/monitors/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { 
    monitors, 
    monitorResults, 
    MonitorStatus as DBMoniotorStatusType, 
    MonitorType as DBMonitorType,
    MonitorResultStatus as DBMonitorResultStatusType,
    MonitorConfig
} from "@/db/schema/schema";
import { eq, desc } from "drizzle-orm";

const RECENT_RESULTS_LIMIT = 1000;

type MonitorDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

// Direct server-side data fetching function (replaces the old fetchMonitorWithResults that used HTTP fetch)
async function getMonitorDetailsDirectly(id: string): Promise<MonitorWithResults | null> {
  try {
    const monitorData = await db.query.monitors.findFirst({
      where: eq(monitors.id, id),
    });

    if (!monitorData) {
      return null; 
    }

    const recentResultsData = await db
      .select()
      .from(monitorResults)
      .where(eq(monitorResults.monitorId, id))
      .orderBy(desc(monitorResults.checkedAt))
      .limit(RECENT_RESULTS_LIMIT);

    // Map DB results to MonitorResultItem structure
    const mappedRecentResults: MonitorResultItem[] = recentResultsData.map((r) => ({
      ...r,
      id: r.id,
      monitorId: r.monitorId,
      checkedAt: r.checkedAt ? new Date(r.checkedAt).toISOString() : new Date().toISOString(),
      status: r.status as DBMonitorResultStatusType, // This should now align if MonitorResultItem expects DBMonitorResultStatusType
      responseTimeMs: r.responseTimeMs,
      details: r.details,
      isUp: r.isUp,
    }));
    
    const frequencyMinutes = monitorData.frequencyMinutes ?? 0;
    const intervalInSeconds = frequencyMinutes * 60;

    // Helper to map DB MonitorType to the 'method' string expected by MonitorSchemaType
    let methodValue: MonitorSchemaType['method'];
    switch (monitorData.type) {
        case "http_request":
            methodValue = "http_request";
            break;
        case "ping_host":
            methodValue = "ping"; // Map ping_host to ping
            break;
        case "port_check":
            methodValue = "port_check";
            break;

        // Add other cases as necessary or a default case
        default:
            // Attempt to cast directly, or use a default if appropriate
            // For safety, let's default to http_request or handle as an error
            // This depends on how strictly you want to enforce the mapping
            methodValue = "http_request"; // Or throw new Error(`Unsupported monitor type: ${monitorData.type}`);
    }

    const transformedMonitor: MonitorWithResults = {
      ...monitorData,
      id: monitorData.id,
      name: monitorData.name,
      url: monitorData.target, 
      method: methodValue, // Use the mapped/cast method value
      frequencyMinutes: frequencyMinutes, 
      status: monitorData.status as "up" | "down" | "paused", 
      active: monitorData.status !== 'paused',
      createdAt: monitorData.createdAt ? new Date(monitorData.createdAt).toISOString() : undefined,
      updatedAt: monitorData.updatedAt ? new Date(monitorData.updatedAt).toISOString() : undefined,
      lastCheckedAt: monitorData.lastCheckAt ? new Date(monitorData.lastCheckAt).toISOString() : undefined,
      responseTime: mappedRecentResults[0]?.responseTimeMs ?? undefined,
      uptime: undefined, 
      recentResults: mappedRecentResults,
     
    };

    return transformedMonitor;

  } catch (error) {
    console.error(`Error in getMonitorDetailsDirectly for ${id}:`, error);
    throw error; // Re-throw to be caught by Next.js error handling
  }
}

export async function generateMetadata({ params }: MonitorDetailsPageProps): Promise<Metadata> {
  const { id } = await params; // Wait for params to resolve
  const monitor = await getMonitorDetailsDirectly(id); 
  if (!monitor) {
    return {
      title: "Monitor Not Found | Supercheck",
    };
  }
  return {
    title: `Monitor: ${monitor.name} | Supercheck`,
    description: `Details and results for monitor ${monitor.name}`,
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

export default async function MonitorDetailsPage({ params }: MonitorDetailsPageProps) {
  const { id } = await params; // Wait for params to resolve
  const monitorWithData = await getMonitorDetailsDirectly(id);

  if (!monitorWithData) {
    notFound();
  }
  
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Monitors", href: "/monitors" },
    { label: monitorWithData.name || "Monitor Details", isCurrentPage: true }, 
  ];

  return (
    <div className="w-full max-w-full">
      <PageBreadcrumbs items={breadcrumbs} />
      <Suspense fallback={<DetailSkeleton />}>
        <MonitorDetailClient monitor={monitorWithData} />
      </Suspense>
    </div>
  );
} 