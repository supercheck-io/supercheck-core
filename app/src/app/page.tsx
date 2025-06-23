"use client";

import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Database, 
  Monitor, 
  Play, 
  TrendingUp, 
  RefreshCw,
  Cpu
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { monitorTypes } from "@/components/monitors/data";

interface DashboardData {
  queue: {
    running: number;
    runningCapacity: number;
    queued: number;
    queuedCapacity: number;
  };
  monitors: {
    total: number;
    active: number;
    up: number;
    down: number;
    uptime: number;
    recentChecks24h: number;
    byType: Array<{ type: string; count: number }>;
    criticalAlerts: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      lastCheckAt: string | null;
    }>;
    availabilityTrend: Array<{ date: string; uptime: number }>;
    responseTime: {
      avg: number | null;
      min: number | null;
      max: number | null;
    };
  };
  jobs: {
    total: number;
    active: number;
    recentRuns7d: number;
    successfulRuns24h: number;
    failedRuns24h: number;
    byStatus: Array<{ status: string; count: number }>;
    recentRuns: Array<{
      id: string;
      jobId: string;
      jobName: string;
      status: string;
      startedAt: string;
      duration: string;
    }>;
  };
  tests: {
    total: number;
    byType: Array<{ type: string; count: number }>;
    recentActivity7d: number;
  };
  system: {
    timestamp: string;
    healthy: boolean;
  };
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
        const response = await fetch('/api/dashboard');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }
        const data = await response.json();
        setDashboardData(data);
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

  if (loading) {
    return (
      <>
        <PageBreadcrumbs items={breadcrumbs} />
        <div className="flex-1 space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-muted-foreground">Welcome to your monitoring and automation overview</p>
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-0 pb-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mt-2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-muted rounded w-1/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageBreadcrumbs items={breadcrumbs} />
        <div className="flex-1 space-y-6 p-6">
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
        </div>
      </>
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
    <>
      <PageBreadcrumbs items={breadcrumbs} />
      <div className="flex-1 space-y-4 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome to your monitoring and automation overview
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={dashboardData.system.healthy ? "default" : "destructive"}>
              {dashboardData.system.healthy ? "System Healthy" : "Issues Detected"}
            </Badge>
            <p className="text-sm text-muted-foreground">
              Last updated {formatDistanceToNow(new Date(dashboardData.system.timestamp), { addSuffix: true })}
            </p>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Health</CardTitle>
              <Activity className={cn("h-4 w-4", dashboardData.system.healthy ? "text-green-500" : "text-red-500")} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData.system.healthy ? "Healthy" : "Issues"}
              </div>
              <p className="text-xs text-muted-foreground">
                Overall system status
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Monitor Uptime</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboardData.monitors.uptime.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Last 24 hours ({dashboardData.monitors.recentChecks24h} checks)
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Queue Status</CardTitle>
              <Cpu className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData.queue.running}/{dashboardData.queue.runningCapacity}
              </div>
              <p className="text-xs text-muted-foreground">
                Running ({dashboardData.queue.queued} queued)
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Monitor Overview */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Monitor className="h-5 w-5" />
                Monitor Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-xl font-bold text-blue-600">{dashboardData.monitors.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-green-600">{dashboardData.monitors.up}</div>
                  <div className="text-xs text-muted-foreground">Up</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-red-600">{dashboardData.monitors.down}</div>
                  <div className="text-xs text-muted-foreground">Down</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-gray-600">{dashboardData.monitors.active}</div>
                  <div className="text-xs text-muted-foreground">Active</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Monitor Types</h4>
                <div className="grid grid-cols-1 gap-1">
                  {dashboardData.monitors.byType.map((type) => {
                    const IconComponent = getMonitorTypeIcon(type.type);
                    const colorClass = getMonitorTypeColor(type.type);
                    return (
                      <div key={type.type} className="flex items-center justify-between py-1 px-2 bg-muted/30 rounded text-sm">
                        <div className="flex items-center gap-2">
                          <IconComponent className={cn("h-3 w-3", colorClass)} />
                          <span className="text-xs capitalize">{type.type.replace('_', ' ')}</span>
                        </div>
                        <Badge variant="outline" className="text-xs h-5">{type.count}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
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
                <div className="text-center py-4">
                  <CheckCircle className="h-6 w-6 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">All monitors are healthy!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dashboardData.monitors.criticalAlerts.map((alert) => {
                    const IconComponent = getMonitorTypeIcon(alert.type);
                    const colorClass = getMonitorTypeColor(alert.type);
                    return (
                      <div key={alert.id} className="flex items-center justify-between p-2 border rounded text-sm">
                        <div className="flex items-center gap-2">
                          <IconComponent className={cn("h-3 w-3", colorClass)} />
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
                        <Badge variant="destructive" className="text-xs">Down</Badge>
                      </div>
                    );
                  })}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full mt-3"
                    onClick={() => router.push('/monitors')}
                  >
                    View All Monitors
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Jobs & Tests Overview */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Play className="h-5 w-5 text-blue-500" />
                Job Automation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xl font-bold">{dashboardData.jobs.total}</div>
                  <div className="text-xs text-muted-foreground">Total Jobs</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-green-600">{dashboardData.jobs.successfulRuns24h}</div>
                  <div className="text-xs text-muted-foreground">Passed (24h)</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-red-600">{dashboardData.jobs.failedRuns24h}</div>
                  <div className="text-xs text-muted-foreground">Failed (24h)</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Recent Job Runs</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {dashboardData.jobs.recentRuns.slice(0, 3).map((run) => (
                    <div key={run.id} className="flex items-center justify-between py-1 px-2 bg-muted/30 rounded text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusBadgeVariant(run.status)} className="text-xs h-4">
                          {run.status}
                        </Badge>
                        <div>
                          <p className="text-xs font-medium">{run.jobName}</p>
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
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => router.push('/jobs')}
                >
                  View All Jobs
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5 text-purple-500" />
                Test Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <div className="text-xl font-bold">{dashboardData.tests.total}</div>
                  <div className="text-xs text-muted-foreground">Total Tests</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-blue-600">{dashboardData.tests.recentActivity7d}</div>
                  <div className="text-xs text-muted-foreground">Runs (7d)</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-sm">Test Types</h4>
                <div className="space-y-1">
                  {dashboardData.tests.byType.map((type) => (
                    <div key={type.type} className="flex items-center justify-between py-1 px-2 bg-muted/30 rounded text-sm">
                      <span className="text-xs capitalize">{type.type.replace('_', ' ')}</span>
                      <Badge variant="outline" className="text-xs h-4">{type.count}</Badge>
                    </div>
                  ))}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => router.push('/tests')}
                >
                  View All Tests
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>


      </div>
    </>
  );
}
