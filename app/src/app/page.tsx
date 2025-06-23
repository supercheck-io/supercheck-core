"use client";

import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Database, 
  Monitor, 
  Play, 
  TrendingUp, 
  RefreshCw,
  Cpu,
  BarChart3,
  Clock,
  Zap,
  Globe,
  TestTube,
  Calendar,
  Shield,
  Network
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
      <div className="flex flex-col">
        <PageBreadcrumbs items={breadcrumbs} />
        <div className="flex-1 p-6">
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col">
        <PageBreadcrumbs items={breadcrumbs} />
        <div className="flex-1 p-6">
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
    <div className=" flex flex-col">
      <PageBreadcrumbs items={breadcrumbs} />
      
      <div className="flex-1 p-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Monitoring and automation overview
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={dashboardData.system.healthy ? "default" : "destructive"}>
              {dashboardData.system.healthy ? "Healthy" : "Issues"}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(dashboardData.system.timestamp), { addSuffix: true })}
            </p>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-3 md:grid-cols-4 mb-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System</CardTitle>
              <Activity className={cn("h-4 w-4", dashboardData.system.healthy ? "text-green-500" : "text-red-500")} />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {dashboardData.system.healthy ? "Healthy" : "Issues"}
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Uptime</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{dashboardData.monitors.uptime.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {dashboardData.monitors.recentChecks24h} checks
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Queue</CardTitle>
              <Cpu className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {dashboardData.queue.running}/{dashboardData.queue.runningCapacity}
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboardData.queue.queued} queued
              </p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Response</CardTitle>
              <Zap className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {dashboardData.monitors.responseTime.avg ? `${dashboardData.monitors.responseTime.avg}ms` : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">
                Avg response time
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="overview" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="monitors">Monitors</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="flex-1 mt-4">
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
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Play className="h-5 w-5 text-blue-500" />
                    Job Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{dashboardData.jobs.total}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{dashboardData.jobs.successfulRuns24h}</div>
                      <div className="text-xs text-muted-foreground">Passed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{dashboardData.jobs.failedRuns24h}</div>
                      <div className="text-xs text-muted-foreground">Failed</div>
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
            </div>
          </TabsContent>

          <TabsContent value="monitors" className="flex-1 mt-4">
            <div className="grid gap-4 md:grid-cols-2 h-full">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart3 className="h-5 w-5" />
                    Monitor Types
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dashboardData.monitors.byType.map((type) => {
                    const IconComponent = getMonitorTypeIcon(type.type);
                    const colorClass = getMonitorTypeColor(type.type);
                    return (
                      <div key={type.type} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2">
                          <IconComponent className={cn("h-4 w-4", colorClass)} />
                          <span className="text-sm capitalize">{type.type.replace('_', ' ')}</span>
                        </div>
                        <Badge variant="outline">{type.count}</Badge>
                      </div>
                    );
                  })}
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

          <TabsContent value="automation" className="flex-1 mt-4">
            <div className="grid gap-4 md:grid-cols-2 h-full">
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

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TestTube className="h-5 w-5 text-purple-500" />
                    Test Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{dashboardData.tests.total}</div>
                      <div className="text-xs text-muted-foreground">Total Tests</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{dashboardData.tests.recentActivity7d}</div>
                      <div className="text-xs text-muted-foreground">Runs (7d)</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {dashboardData.tests.byType.map((type) => (
                      <div key={type.type} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <span className="text-sm capitalize">{type.type.replace('_', ' ')}</span>
                        <Badge variant="outline">{type.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="flex-1 mt-4">
            <div className="grid gap-4 md:grid-cols-2 h-full">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5" />
                    Availability Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardData.monitors.availabilityTrend.slice(-7).map((day) => (
                      <div key={day.date} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <span className="text-sm">{day.date}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${day.uptime}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium">{day.uptime.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Zap className="h-5 w-5" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-lg font-bold text-green-600">
                          {dashboardData.monitors.responseTime.avg || 0}ms
                        </div>
                        <div className="text-xs text-muted-foreground">Average</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-blue-600">
                          {dashboardData.monitors.responseTime.min || 0}ms
                        </div>
                        <div className="text-xs text-muted-foreground">Minimum</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-orange-600">
                          {dashboardData.monitors.responseTime.max || 0}ms
                        </div>
                        <div className="text-xs text-muted-foreground">Maximum</div>
                      </div>
                    </div>
                    
                    <div className="pt-4 border-t">
                      <h4 className="font-medium text-sm mb-2">Queue Performance</h4>
                      <div className="grid grid-cols-2 gap-3 text-center">
                        <div>
                          <div className="text-lg font-bold">{dashboardData.queue.running}</div>
                          <div className="text-xs text-muted-foreground">Running</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">{dashboardData.queue.queued}</div>
                          <div className="text-xs text-muted-foreground">Queued</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
