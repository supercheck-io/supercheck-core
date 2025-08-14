"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Monitor,
  RefreshCw,
  Code,
  Calendar,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectStats {
  tests: number;
  jobs: number;
  monitors: number;
  runs: number;
}

interface MonitorSummary {
  total: number;
  active: number;
  up: number;
  down: number;
  uptime: number;
  criticalAlerts: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    lastCheckAt: string | null;
  }>;
  byType: Array<{ type: string; count: number }>;
  responseTime: {
    avg: number | null;
    min: number | null;
    max: number | null;
  };
}

interface JobSummary {
  total: number;
  successfulRuns24h: number;
  failedRuns24h: number;
  recentRuns: Array<{
    id: string;
    jobId: string;
    jobName: string;
    status: string;
    startedAt: string;
    duration: string;
  }>;
}

interface TestSummary {
  total: number;
  byType: Array<{ type: string; count: number }>;
  recentActivity7d: number;
}

interface AlertHistoryItem {
  id: string;
  targetType: string;
  targetName: string;
  type: string;
  message: string;
  status: string;
  timestamp: string;
  notificationProvider: string;
}

interface SystemHealth {
  timestamp: string;
  healthy: boolean;
  issues: Array<{
    type: 'monitor' | 'job' | 'queue';
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

interface DashboardData {
  stats: ProjectStats;
  monitors: MonitorSummary;
  jobs: JobSummary;
  tests: TestSummary;
  alerts: AlertHistoryItem[];
  system: SystemHealth;
}

export default function Home() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Dashboard", isCurrentPage: true },
  ];

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [dashboardResponse, alertsResponse] = await Promise.all([
          fetch('/api/dashboard'),
          fetch('/api/alerts/history')
        ]);

        if (!dashboardResponse.ok) {
          throw new Error('Failed to fetch dashboard data');
        }

        const data = await dashboardResponse.json();
        const alertsData = alertsResponse.ok ? await alertsResponse.json() : [];
        // Transform the existing API response to match new interface
        const systemIssues = [];

        // Analyze system health
        if (data.monitors?.down > 0) {
          systemIssues.push({
            type: 'monitor' as const,
            message: `${data.monitors.down} monitor(s) are down`,
            severity: data.monitors.down > 2 ? 'critical' as const : 'high' as const
          });
        }

        if (data.jobs?.failedRuns24h > 0) {
          systemIssues.push({
            type: 'job' as const,
            message: `${data.jobs.failedRuns24h} job(s) failed in the last 24 hours`,
            severity: data.jobs.failedRuns24h > 5 ? 'high' as const : 'medium' as const
          });
        }

        if (data.queue?.running >= data.queue?.runningCapacity * 0.9) {
          systemIssues.push({
            type: 'queue' as const,
            message: 'Queue capacity is running high',
            severity: 'medium' as const
          });
        }

        const transformedData: DashboardData = {
          stats: {
            tests: data.tests?.total || 0,
            jobs: data.jobs?.total || 0,
            monitors: data.monitors?.total || 0,
            runs: data.jobs?.recentRuns7d || 0,
          },
          monitors: {
            total: data.monitors?.total || 0,
            active: data.monitors?.active || 0,
            up: data.monitors?.up || 0,
            down: data.monitors?.down || 0,
            uptime: data.monitors?.uptime || 0,
            criticalAlerts: data.monitors?.criticalAlerts || [],
            byType: data.monitors?.byType || [],
            responseTime: data.monitors?.responseTime || { avg: null, min: null, max: null },
          },
          jobs: {
            total: data.jobs?.total || 0,
            successfulRuns24h: data.jobs?.successfulRuns24h || 0,
            failedRuns24h: data.jobs?.failedRuns24h || 0,
            recentRuns: data.jobs?.recentRuns || [],
          },
          tests: {
            total: data.tests?.total || 0,
            byType: data.tests?.byType || [],
            recentActivity7d: data.tests?.recentActivity7d || 0,
          },
          alerts: Array.isArray(alertsData) ? alertsData.slice(0, 10) : [],
          system: {
            timestamp: data.system?.timestamp || new Date().toISOString(),
            healthy: data.system?.healthy || systemIssues.length === 0,
            issues: systemIssues
          },
        };
        setDashboardData(transformedData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Check for project switch success and show toast after delay
  useEffect(() => {
    const projectName = sessionStorage.getItem('projectSwitchSuccess');
    if (projectName) {
      // Remove from sessionStorage immediately
      sessionStorage.removeItem('projectSwitchSuccess');

      // Show toast with delay to let page settle
      setTimeout(() => {
        toast.success(`Switched to ${projectName}`);
      }, 500);
    }
  }, []);


  if (loading) {
    return (
      <div>
        {/* Breadcrumbs skeleton */}

        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 m-4">
          <CardContent className="p-6">
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
                <TabsTrigger value="automation">Automation</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Skeleton className="h-8 w-56 mb-2" />
                    <Skeleton className="h-4 w-96" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-2 w-2 rounded-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>

                {/* Key Metrics Grid - 6 cards in 3 columns */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-4" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-8 w-12 mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 m-4">
          <CardContent className="p-6">
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Error Loading Dashboard
                </CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!dashboardData) return null;

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 m-4">
        <CardContent className="p-6">
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
              <TabsTrigger value="automation">Automation</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">Project Dashboard</h2>
                  <p className="text-muted-foreground text-sm">Comprehensive overview of your project&apos;s health, performance, and recent activity.</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-2 w-2 rounded-full",
                    dashboardData.system.healthy ? "bg-green-500" : "bg-red-500"
                  )} />
                  <span className={cn(
                    "text-xs font-medium",
                    dashboardData.system.healthy ? "text-green-600" : "text-red-600"
                  )}>
                    {dashboardData.system.healthy ? "Operational" : "Issues"}
                  </span>
                </div>
              </div>

              {/* System Issues Alert */}
              {!dashboardData.system.healthy && dashboardData.system.issues.length > 0 && (
                <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200 text-lg">
                      <AlertCircle className="h-5 w-5" />
                      System Issues Detected
                    </CardTitle>
                    <CardDescription className="text-red-700 dark:text-red-300">
                      {dashboardData.system.issues.length} issue{dashboardData.system.issues.length > 1 ? 's' : ''} requiring attention
                    </CardDescription>
                  </CardHeader>
                </Card>
              )}

              {/* Key Metrics Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tests</CardTitle>
                    <Code className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.stats.tests}</div>
                    <p className="text-xs text-muted-foreground">
                      Test cases
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Jobs</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.stats.jobs}</div>
                    <p className="text-xs text-muted-foreground">
                      Scheduled jobs
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Monitors</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.stats.monitors}</div>
                    <p className="text-xs text-muted-foreground">
                      Active monitors
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.stats.runs}</div>
                    <p className="text-xs text-muted-foreground">
                      Test executions
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dashboardData.jobs.successfulRuns24h + dashboardData.jobs.failedRuns24h > 0
                        ? Math.round((dashboardData.jobs.successfulRuns24h / (dashboardData.jobs.successfulRuns24h + dashboardData.jobs.failedRuns24h)) * 100)
                        : 100}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last 24 hours
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.monitors.uptime.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground">
                      Monitor uptime
                    </p>
                  </CardContent>
                </Card>
              </div>

            </TabsContent>

            <TabsContent value="monitoring" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">Monitor Overview</h2>
                  <p className="text-muted-foreground text-sm">Real-time monitoring status, uptime metrics, and performance insights.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Monitors</CardTitle>
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.monitors.total}</div>
                    <p className="text-xs text-muted-foreground">
                      All monitors
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Up</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{dashboardData.monitors.up}</div>
                    <p className="text-xs text-muted-foreground">
                      Healthy monitors
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Down</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{dashboardData.monitors.down}</div>
                    <p className="text-xs text-muted-foreground">
                      Failed monitors
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.monitors.uptime.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground">
                      Overall uptime
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.monitors.active}</div>
                    <p className="text-xs text-muted-foreground">
                      Active monitors
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dashboardData.monitors.responseTime.avg ? `${dashboardData.monitors.responseTime.avg}ms` : 'N/A'}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Response time
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="automation" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">Automation Overview</h2>
                  <p className="text-muted-foreground text-sm">Job execution statistics, success rates, and automation performance metrics.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.jobs.total}</div>
                    <p className="text-xs text-muted-foreground">
                      All jobs
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Successful (24h)</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{dashboardData.jobs.successfulRuns24h}</div>
                    <p className="text-xs text-muted-foreground">
                      Passed jobs
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Failed (24h)</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{dashboardData.jobs.failedRuns24h}</div>
                    <p className="text-xs text-muted-foreground">
                      Failed jobs
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dashboardData.jobs.successfulRuns24h + dashboardData.jobs.failedRuns24h > 0
                        ? Math.round((dashboardData.jobs.successfulRuns24h / (dashboardData.jobs.successfulRuns24h + dashboardData.jobs.failedRuns24h)) * 100)
                        : 100}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last 24 hours
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
                    <Code className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.stats.tests}</div>
                    <p className="text-xs text-muted-foreground">
                      Available tests
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Recent Runs</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.jobs.recentRuns.length}</div>
                    <p className="text-xs text-muted-foreground">
                      Recent executions
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
