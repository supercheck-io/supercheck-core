import { Metadata } from "next"; 
import { MonitorDetailClient, MonitorWithResults, MonitorResultItem } from "@/components/monitors/monitor-detail-client";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { notFound } from "next/navigation";
import { db } from "@/utils/db";
import { 
    monitors, 
    monitorResults, 
    projects,
    MonitorStatus as DBMoniotorStatusType, 
    MonitorType as DBMonitorType,
    MonitorResultStatus as DBMonitorResultStatusType,
    MonitorConfig
} from "@/db/schema/schema";
import { eq, desc } from "drizzle-orm";

const resultsLimit = process.env.RECENT_MONITOR_RESULTS_LIMIT ? parseInt(process.env.RECENT_MONITOR_RESULTS_LIMIT) : 1000;

type MonitorDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

// Direct server-side data fetching function (replaces the old fetchMonitorWithResults that used HTTP fetch)
async function getMonitorDetailsDirectly(id: string): Promise<MonitorWithResults | null> {
  try {
    const monitorData = await db
      .select({
        id: monitors.id,
        name: monitors.name,
        target: monitors.target,
        type: monitors.type,
        enabled: monitors.enabled,
        frequencyMinutes: monitors.frequencyMinutes,
        status: monitors.status,
        createdAt: monitors.createdAt,
        updatedAt: monitors.updatedAt,
        lastCheckAt: monitors.lastCheckAt,
        config: monitors.config,
        alertConfig: monitors.alertConfig,
        projectId: monitors.projectId,
        organizationId: monitors.organizationId,
        projectName: projects.name,
      })
      .from(monitors)
      .leftJoin(projects, eq(monitors.projectId, projects.id))
      .where(eq(monitors.id, id))
      .limit(1);

    if (!monitorData || monitorData.length === 0) {
      return null; 
    }

    const monitor = monitorData[0];

    const recentResultsData = await db
      .select()
      .from(monitorResults)
      .where(eq(monitorResults.monitorId, id))
      .orderBy(desc(monitorResults.checkedAt))
      .limit(resultsLimit);

    // Map DB results to MonitorResultItem structure
    const mappedRecentResults: MonitorResultItem[] = recentResultsData.map((r) => ({
      id: r.id,
      monitorId: r.monitorId,
      checkedAt: r.checkedAt ? new Date(r.checkedAt).toISOString() : new Date().toISOString(),
      status: r.status as DBMonitorResultStatusType,
      responseTimeMs: r.responseTimeMs,
      details: r.details,
      isUp: r.isUp,
      isStatusChange: r.isStatusChange,
    }));
    
    const frequencyMinutes = monitor.frequencyMinutes ?? 0;

    const transformedMonitor: MonitorWithResults = {
      id: monitor.id,
      name: monitor.name,
      url: monitor.target,
      target: monitor.target,
      type: monitor.type as DBMonitorType,
      enabled: monitor.enabled,
      frequencyMinutes,
      status: monitor.status as DBMoniotorStatusType,
      active: monitor.status !== 'paused',
      createdAt: monitor.createdAt ? new Date(monitor.createdAt).toISOString() : undefined,
      updatedAt: monitor.updatedAt ? new Date(monitor.updatedAt).toISOString() : undefined,
      lastCheckedAt: monitor.lastCheckAt ? new Date(monitor.lastCheckAt).toISOString() : undefined,
      responseTime: mappedRecentResults[0]?.responseTimeMs ?? undefined,
      uptime: undefined, 
      recentResults: mappedRecentResults,
      config: monitor.config as MonitorConfig,
      alertConfig: monitor.alertConfig || undefined,
      projectName: monitor.projectName || undefined,
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
    title: "Monitor Details | Supercheck",
    description: "Details and results for monitor",
  };
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
    { label: monitorWithData.name && monitorWithData.name.length > 30 ? `${monitorWithData.name?.substring(0, 30)}...` : monitorWithData.name || id, isCurrentPage: true }, 
  ];

  return (
    <div className="w-full max-w-full">
      <PageBreadcrumbs items={breadcrumbs} />
        <MonitorDetailClient monitor={monitorWithData} />
    </div>
  );
} 