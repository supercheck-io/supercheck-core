import { Suspense } from "react";
import { Metadata } from "next";
// MonitorSchemaType is used by MonitorDetailClient, keep if that prop type remains
// import { Monitor as MonitorSchemaType } from "@/components/monitors/schema"; 
import { MonitorDetailClient, MonitorWithResults, MonitorResultItem } from "@/components/monitors/monitor-detail-client";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { notFound } from "next/navigation";
import { db as getDbInstance } from "@/lib/db";
import { 
    monitors, 
    monitorResults, 
    MonitorStatus as DBMoniotorStatusType, 
    MonitorType as DBMonitorType,
    MonitorResultStatus as DBMonitorResultStatusType,
    MonitorConfig
} from "@/db/schema/schema";
import { eq, desc } from "drizzle-orm";

const RECENT_RESULTS_LIMIT = 20;

type MonitorDetailsPageProps = {
  params: {
    id: string;
  };
};

// Direct server-side data fetching function (replaces the old fetchMonitorWithResults that used HTTP fetch)
async function getMonitorDetailsDirectly(id: string): Promise<MonitorWithResults | null> {
  try {
    const db = await getDbInstance();
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

    // Helper to map DB MonitorType to the 'method' string expected by MonitorWithResults/MonitorSchemaType
    // This is an assumption; the actual mapping might be different based on MonitorSchemaType definition.
    // For now, we'll pass the DB type and let MonitorDetailClient handle it or adjust if MonitorSchemaType is known.
    const methodValue = monitorData.type as DBMonitorType;

    const transformedMonitor: MonitorWithResults = {
      ...monitorData,
      id: monitorData.id,
      name: monitorData.name,
      description: monitorData.description,
      url: monitorData.target, 
      method: methodValue, // Use the mapped/cast method value
      interval: intervalInSeconds, 
      status: monitorData.status as "up" | "down" | "paused", 
      active: monitorData.status !== 'paused',
      createdAt: monitorData.createdAt ? new Date(monitorData.createdAt).toISOString() : undefined,
      updatedAt: monitorData.updatedAt ? new Date(monitorData.updatedAt).toISOString() : undefined,
      lastCheckedAt: monitorData.lastCheckAt ? new Date(monitorData.lastCheckAt).toISOString() : undefined,
      responseTime: mappedRecentResults[0]?.responseTimeMs ?? undefined,
      uptime: undefined, 
      recentResults: mappedRecentResults,
      config: monitorData.config as MonitorConfig | undefined,
    };

    return transformedMonitor;

  } catch (error) {
    console.error(`Error in getMonitorDetailsDirectly for ${id}:`, error);
    throw error; // Re-throw to be caught by Next.js error handling
  }
}

export async function generateMetadata({ params }: MonitorDetailsPageProps): Promise<Metadata> {
  const monitor = await getMonitorDetailsDirectly(params.id); 
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
  const monitorWithData = await getMonitorDetailsDirectly(params.id);

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