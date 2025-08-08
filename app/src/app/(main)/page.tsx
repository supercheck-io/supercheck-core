"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Monitor, 
  Play, 
  RefreshCw,
  Clock,
  Code2,
  Calendar,
  TrendingUp,
  Zap,
  FileText,
  AlertCircle
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { monitorTypes } from "@/components/monitors/data";
import { toast } from "sonner";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

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
  const router = useRouter();

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
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 m-4">
          <CardContent className="p-6">
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
                <TabsTrigger value="automation">Automation</TabsTrigger>
                <TabsTrigger value="testing">Testing</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-8 bg-gray-200 rounded w-40 animate-pulse mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-80 animate-pulse"></div>
                  </div>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                        <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
                      </CardHeader>
                      <CardContent>
                        <div className="h-8 bg-gray-200 rounded w-16 animate-pulse mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-24 animate-pulse"></div>
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

  const getMonitorTypeIcon = (type: string) => {
    const monitorType = monitorTypes.find(t => t.value === type);
    return monitorType ? monitorType.icon : Monitor;
  };

  const getMonitorTypeColor = (type: string) => {
    const monitorType = monitorTypes.find(t => t.value === type);
    return monitorType ? monitorType.color : "text-gray-500";
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'up':
      case 'passed':
        return 'default';
      case 'down':
      case 'failed':
      case 'error':
        return 'destructive';
      case 'running':
        return 'secondary';
      default:
        return 'outline';
    }
  };

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
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200 text-lg">
                      <AlertCircle className="h-5 w-5" />
                      System Issues Detected
                    </CardTitle>
                    <CardDescription className="text-red-700 dark:text-red-300">
                      {dashboardData.system.issues.length} issue{dashboardData.system.issues.length > 1 ? 's' : ''} requiring attention
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {dashboardData.system.issues.map((issue, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-white/70 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-800/50">
                          <div className={cn(
                            "mt-1 h-2 w-2 rounded-full flex-shrink-0",
                            issue.severity === 'critical' ? "bg-red-500" :
                            issue.severity === 'high' ? "bg-orange-500" :
                            issue.severity === 'medium' ? "bg-amber-500" : "bg-blue-500"
                          )} />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-red-900 dark:text-red-100">
                              {issue.message}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Key Metrics Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Tests</CardTitle>
                    <Code2 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.stats.tests}</div>
                    <p className="text-xs text-muted-foreground">
                      Test cases available
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
                      Automated jobs
                    </p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Monitors</CardTitle>
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.stats.monitors}</div>
                    <p className="text-xs text-muted-foreground">
                      {dashboardData.monitors.uptime.toFixed(1)}% uptime
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
              </div>

              {/* Detailed Information Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <TrendingUp className="h-5 w-5" />
                      Performance Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Response Time (Avg)</span>
                        <span className="text-sm font-medium">
                          {dashboardData.monitors.responseTime.avg ? `${dashboardData.monitors.responseTime.avg}ms` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Jobs Success Rate</span>
                        <span className="text-sm font-medium">
                          {dashboardData.jobs.successfulRuns24h + dashboardData.jobs.failedRuns24h > 0 
                            ? `${Math.round((dashboardData.jobs.successfulRuns24h / (dashboardData.jobs.successfulRuns24h + dashboardData.jobs.failedRuns24h)) * 100)}%`
                            : '100%'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Monitor Uptime</span>
                        <span className="text-sm font-medium">{dashboardData.monitors.uptime.toFixed(2)}%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Active Monitors</span>
                        <span className="text-sm font-medium">{dashboardData.monitors.active}/{dashboardData.monitors.total}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Zap className="h-5 w-5" />
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Test Runs (7 days)</span>
                        <span className="text-sm font-medium">{dashboardData.tests.recentActivity7d}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Successful Jobs (24h)</span>
                        <span className="text-sm font-medium text-green-600">{dashboardData.jobs.successfulRuns24h}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Failed Jobs (24h)</span>
                        <span className={cn(
                          "text-sm font-medium",
                          dashboardData.jobs.failedRuns24h > 0 ? "text-amber-600" : "text-muted-foreground"
                        )}>{dashboardData.jobs.failedRuns24h}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Down Monitors</span>
                        <span className={cn(
                          "text-sm font-medium",
                          dashboardData.monitors.down > 0 ? "text-amber-600" : "text-muted-foreground"
                        )}>{dashboardData.monitors.down}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <FileText className="h-5 w-5" />
                      Resource Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {dashboardData.tests.byType.map((type) => (
                        <div key={type.type} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground capitalize">{type.type.replace('_', ' ')} Tests</span>
                          <span className="text-sm font-medium">{type.count}</span>
                        </div>
                      ))}
                      {dashboardData.monitors.byType.map((type) => (
                        <div key={type.type} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground capitalize">{type.type.replace('_', ' ')} Monitors</span>
                          <span className="text-sm font-medium">{type.count}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

            </TabsContent>
          
            <TabsContent value="monitoring" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 h-full">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Monitor className="h-5 w-5" />
                      Monitor Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{dashboardData.monitors.total}</div>
                        <div className="text-xs text-muted-foreground">Total</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{dashboardData.monitors.up}</div>
                        <div className="text-xs text-muted-foreground">Up</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">{dashboardData.monitors.down}</div>
                        <div className="text-xs text-muted-foreground">Down</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-600">{dashboardData.monitors.active}</div>
                        <div className="text-xs text-muted-foreground">Active</div>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => router.push('/monitors')}
                    >
                      View All Monitors
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                      Critical Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dashboardData.monitors.criticalAlerts.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">All monitors are healthy!</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dashboardData.monitors.criticalAlerts.slice(0, 3).map((alert) => {
                          const IconComponent = getMonitorTypeIcon(alert.type);
                          const colorClass = getMonitorTypeColor(alert.type);
                          return (
                            <div key={alert.id} className="flex items-center justify-between p-2 border rounded">
                              <div className="flex items-center gap-2">
                                <IconComponent className={cn("h-4 w-4", colorClass)} />
                                <div>
                                  <p className="text-sm font-medium">{alert.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {alert.lastCheckAt 
                                      ? formatDistanceToNow(new Date(alert.lastCheckAt), { addSuffix: true })
                                      : 'Never checked'
                                    }
                                  </p>
                                </div>
                              </div>
                              <Badge variant="destructive">Down</Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="automation" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 h-full">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Play className="h-5 w-5 text-blue-500" />
                      Job Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{dashboardData.jobs.total}</div>
                        <div className="text-xs text-muted-foreground">Total Jobs</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{dashboardData.jobs.successfulRuns24h}</div>
                        <div className="text-xs text-muted-foreground">Passed (24h)</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600">{dashboardData.jobs.failedRuns24h}</div>
                        <div className="text-xs text-muted-foreground">Failed (24h)</div>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => router.push('/jobs')}
                    >
                      View All Jobs
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Clock className="h-5 w-5" />
                      Recent Job Runs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dashboardData.jobs.recentRuns.slice(0, 5).map((run) => (
                        <div key={run.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <div className="flex items-center gap-2">
                            <Badge variant={getStatusBadgeVariant(run.status)} className="text-xs">
                              {run.status}
                            </Badge>
                            <div>
                              <p className="text-sm font-medium">{run.jobName}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {run.duration}
                          </div>
                        </div>
                      ))}
                    </div>
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
