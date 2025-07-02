"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  Activity,
  CheckCircle,
  Clock,
  CalendarIcon,
  Trash2,
  Edit3,
  Play,
  Pause,
  Zap,
  TrendingUp,
  ShieldCheck,
  XCircle,
  AlertCircle,
  X,
  Copy,
  Shield,
  Bell,
  BellOff,
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { monitorStatuses, monitorTypes } from "@/components/monitors/data";
import { Monitor, monitorSchema } from "./schema";
import { AlertConfig } from "@/db/schema/schema";
import { formatDistanceToNow, format, startOfDay, endOfDay, parseISO, subHours, subDays, isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ResponseTimeBarChart } from "@/components/monitors/response-time-line-chart";
import { AvailabilityBarChart } from "./AvailabilityBarChart";
import { 
    MonitorStatus as DBMoniotorStatusType,
    MonitorResultStatus as DBMonitorResultStatusType, 
    MonitorResultDetails as DBMonitorResultDetailsType 
} from "@/db/schema/schema";

export interface MonitorResultItem {
  id: string;
  monitorId: string;
  checkedAt: string | Date;
  status: DBMonitorResultStatusType;
  responseTimeMs?: number | null;
  details?: DBMonitorResultDetailsType | null;
  isUp: boolean;
  isStatusChange: boolean;
}

export type MonitorWithResults = Monitor & {
  recentResults?: MonitorResultItem[];
};

interface MonitorDetailClientProps {
  monitor: MonitorWithResults;
}

const formatDateTime = (dateTimeInput?: string | Date): string => {
    if (!dateTimeInput) return "N/A";
    try {
        const date = typeof dateTimeInput === 'string' ? parseISO(dateTimeInput) : dateTimeInput;
        return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
        console.warn("Failed to format date:", dateTimeInput, error);
        return "Invalid date";
    }
};

// Custom short format for last ping
const formatShortDateTime = (dateTimeInput?: string | Date): string => {
    if (!dateTimeInput) return "Never";
    try {
        const date = typeof dateTimeInput === 'string' ? parseISO(dateTimeInput) : dateTimeInput;
        const now = new Date();
        const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
        
        if (diffInMinutes < 1) return "Now";
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h ago`;
        
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d ago`;
    } catch (error) {
        console.warn("Failed to format date:", dateTimeInput, error);
        return "Invalid date";
    }
};

// Simple status icon component to replace the bar chart
const SimpleStatusIcon = ({ isUp }: { isUp: boolean }) => {
  return isUp ? (
    <CheckCircle className="h-4 w-4 text-green-500" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500" />
  );
};

// Status icon for header
const StatusHeaderIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'up':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'down':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'paused':
      return <Pause className="h-5 w-5 text-gray-500" />;
    default:
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
  }
};

export function MonitorDetailClient({ monitor: initialMonitor }: MonitorDetailClientProps) {
  const router = useRouter();
  const [monitor, setMonitor] = useState<MonitorWithResults>(initialMonitor);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const resultsPerPage = 10;

  console.log("[MonitorDetailClient] Initial Monitor Prop:", initialMonitor);
  console.log("[MonitorDetailClient] Monitor Results:", monitor.recentResults);

  useEffect(() => {
    console.log("[MonitorDetailClient] useEffect - initialMonitor changed:", initialMonitor);
    if (initialMonitor && initialMonitor.recentResults && !Array.isArray(initialMonitor.recentResults)) {
      console.warn("[MonitorDetailClient] initialMonitor.recentResults is not an array. Current value:", initialMonitor.recentResults);
      setMonitor({ ...initialMonitor, recentResults: [] });
    } else {
      setMonitor(initialMonitor);
    }
  }, [initialMonitor]);

  console.log("[MonitorDetailClient] Current Monitor State:", monitor);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/monitors/${monitor.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete monitor");
      }
      toast.success(`Monitor "${monitor.name}" deleted successfully.`);
      router.push("/monitors");
      router.refresh();
    } catch (error) {
      console.error("Error deleting monitor:", error);
      toast.error((error as Error).message || "Could not delete monitor.");
    } finally {
        setIsDeleting(false);
        setShowDeleteDialog(false);
    }
  };
  
  const handleToggleStatus = async () => {
    let newStatus: DBMoniotorStatusType = monitor.status === 'paused' ? 'up' : 'paused';
    
    if (monitor.status === 'paused' && monitor.recentResults && monitor.recentResults.length > 0) {
        newStatus = monitor.recentResults[0].isUp ? 'up' : 'down';
    }

    try {
        const response = await fetch(`/api/monitors/${monitor.id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: newStatus }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to update monitor status.`);
        }
        
        const updatedMonitor = await response.json();
        
        // Update local state immediately for a responsive UI
        setMonitor(prev => ({ ...prev, ...updatedMonitor, status: newStatus }));
        toast.success(`Monitor successfully ${newStatus === 'paused' ? 'paused' : 'resumed'}.`);
        
        // Refresh server-side props to get the latest data
        router.refresh();

    } catch (error) {
        console.error("Error toggling monitor status:", error);
        toast.error((error as Error).message || "Could not update monitor status.");
    }
  };

  const handleToggleAlerts = async () => {
    // 1. Save original monitor for potential rollback
    const originalMonitor = monitor;

    // 2. Determine the new state and create a fully-formed alertConfig
    const newAlertsEnabled = !(originalMonitor.alertConfig?.enabled ?? false);
    
    const updatedAlertConfig = {
        enabled: newAlertsEnabled,
        notificationProviders: originalMonitor.alertConfig?.notificationProviders ?? [],
        alertOnFailure: originalMonitor.alertConfig?.alertOnFailure ?? true,
        alertOnRecovery: originalMonitor.alertConfig?.alertOnRecovery ?? true,
        alertOnSslExpiration: originalMonitor.alertConfig?.alertOnSslExpiration ?? true,
        alertOnSuccess: originalMonitor.alertConfig?.alertOnSuccess ?? false,
        alertOnTimeout: originalMonitor.alertConfig?.alertOnTimeout ?? true,
        failureThreshold: originalMonitor.alertConfig?.failureThreshold ?? 1,
        recoveryThreshold: originalMonitor.alertConfig?.recoveryThreshold ?? 1,
        customMessage: originalMonitor.alertConfig?.customMessage ?? "",
    };

    // 3. Optimistically update the UI. The new monitor state is guaranteed to be valid.
    setMonitor({ ...originalMonitor, alertConfig: updatedAlertConfig });

    // 4. Make the API call
    try {
        const response = await fetch(`/api/monitors/${originalMonitor.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                alertConfig: { // Only send the changed value
                    enabled: newAlertsEnabled
                }
            })
        });

        if (!response.ok) {
            // If API fails, it will be caught and we'll roll back.
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to update alert settings.");
        }
        
        const updatedMonitorFromServer = await response.json();

        // 5. Sync with the authoritative state from the server.
        setMonitor(updatedMonitorFromServer);
        toast.success(`Alerts ${newAlertsEnabled ? 'enabled' : 'disabled'} successfully.`);
        
        router.refresh();

    } catch (error) {
        console.error("Error toggling alert settings:", error);
        toast.error((error as Error).message || "Could not update alert settings.");
        
        // 6. Rollback on error
        setMonitor(originalMonitor);
    }
  };

  // Filter results by selected date if any
  const filteredResults = useMemo(() => {
    if (!monitor.recentResults) return [];
    if (!selectedDate) return monitor.recentResults;

    const selectedStart = startOfDay(selectedDate);
    const selectedEnd = endOfDay(selectedDate);

    return monitor.recentResults.filter(result => {
      const resultDate = typeof result.checkedAt === 'string' ? parseISO(result.checkedAt) : result.checkedAt;
      return isWithinInterval(resultDate, { start: selectedStart, end: selectedEnd });
    });
  }, [monitor.recentResults, selectedDate]);

  const responseTimeData = useMemo(() => {
    console.log("[ResponseTimeData] Processing monitor results:", monitor.recentResults);
    
    if (!monitor.recentResults || monitor.recentResults.length === 0) {
      console.log("[ResponseTimeData] No results available");
      return [];
    }
    
    // Use the same dataset as availability chart - first 50 results
    const recentResults = monitor.recentResults.slice(0, 50);
    
    const chartData = recentResults
      .map(r => {
        const date = typeof r.checkedAt === 'string' ? parseISO(r.checkedAt) : r.checkedAt;
        return {
          name: format(date, 'HH:mm'), // Show only time (HH:MM) for cleaner x-axis
          time: r.responseTimeMs || 0,
          fullDate: format(date, 'MMM dd, HH:mm'), // Keep full date for tooltips
          isUp: r.isUp, // Keep status for conditional styling
          status: r.status
        };
      })
      .reverse(); // Show chronologically (oldest first)
    
    console.log("[ResponseTimeData] Final chart data:", chartData);
    return chartData;
  }, [monitor.recentResults]);
  


  // Calculate uptime and average response time from recent results
  const calculatedMetrics = useMemo(() => {
    if (!monitor.recentResults || monitor.recentResults.length === 0) {
      return { uptime24h: "N/A", uptime30d: "N/A", avgResponse24h: "N/A", avgResponse30d: "N/A" };
    }

    const now = new Date();
    const last24Hours = subHours(now, 24);
    const last30Days = subDays(now, 30);

    // Filter results by time period
    const results24h = monitor.recentResults.filter(r => {
      const resultDate = typeof r.checkedAt === 'string' ? parseISO(r.checkedAt) : r.checkedAt;
      return resultDate >= last24Hours;
    });

    const results30d = monitor.recentResults.filter(r => {
      const resultDate = typeof r.checkedAt === 'string' ? parseISO(r.checkedAt) : r.checkedAt;
      return resultDate >= last30Days;
    });

    // Calculate 24h uptime
    const uptime24hPercent = results24h.length > 0 
      ? (results24h.filter(r => r.isUp).length / results24h.length) * 100
      : 0;

    // Calculate 30d uptime
    const uptime30dPercent = results30d.length > 0 
      ? (results30d.filter(r => r.isUp).length / results30d.length) * 100
      : 0;

    // Calculate average response time for 24h (only for successful checks)
    const validResponseTimes24h = results24h
      .filter(r => r.isUp && r.responseTimeMs !== null && r.responseTimeMs !== undefined)
      .map(r => r.responseTimeMs!);

    const avgResponse24hMs = validResponseTimes24h.length > 0
      ? Math.round(validResponseTimes24h.reduce((sum, time) => sum + time, 0) / validResponseTimes24h.length)
      : null;

    // Calculate average response time for 30d (only for successful checks)
    const validResponseTimes30d = results30d
      .filter(r => r.isUp && r.responseTimeMs !== null && r.responseTimeMs !== undefined)
      .map(r => r.responseTimeMs!);

    const avgResponse30dMs = validResponseTimes30d.length > 0
      ? Math.round(validResponseTimes30d.reduce((sum, time) => sum + time, 0) / validResponseTimes30d.length)
      : null;

    return {
      uptime24h: results24h.length > 0 ? `${uptime24hPercent.toFixed(1)}%` : "N/A",
      uptime30d: results30d.length > 0 ? `${uptime30dPercent.toFixed(1)}%` : "N/A",
      avgResponse24h: avgResponse24hMs !== null ? `${avgResponse24hMs} ms` : "N/A",
      avgResponse30d: avgResponse30dMs !== null ? `${avgResponse30dMs} ms` : "N/A"
    };
  }, [monitor.recentResults]);

  const latestResult = monitor.recentResults && monitor.recentResults.length > 0 ? monitor.recentResults[0] : null;
  const currentActualStatus = latestResult ? (latestResult.isUp ? 'up' : 'down') : monitor.status;

  console.log("[MonitorDetailClient] Latest Result:", latestResult);
  console.log("[MonitorDetailClient] Current Actual Status:", currentActualStatus);

  const statusInfo = monitorStatuses.find((s) => s.value === currentActualStatus);
  const monitorTypeInfo = monitorTypes.find((t) => t.value === monitor.type);

  console.log("[MonitorDetailClient] Status Info (for display):", statusInfo);
  console.log("[MonitorDetailClient] Monitor Type Info (for icon):", monitorTypeInfo);

  const currentResponseTime = latestResult && latestResult.responseTimeMs !== undefined && latestResult.responseTimeMs !== null ? `${latestResult.responseTimeMs} ms` : "N/A";

  // Prepare data for AvailabilityBarChart
  const availabilityTimelineData = useMemo(() => {
    if (!monitor.recentResults || monitor.recentResults.length === 0) return [];
    
    if (monitor.type === "heartbeat") {
      // For heartbeat monitors: show all ping events and failures
      const processedResults = [];
      const recentResults = monitor.recentResults.slice(0, 50);
      
      for (let i = 0; i < recentResults.length; i++) {
        const current = recentResults[i];
        
        if (current.isUp) {
          // Always show successful pings as green bars
          processedResults.push(current);
        } else {
          // Show all failures as red bars (both explicit failures and ping overdue)
          // This includes:
          // - Explicit failures reported via /fail endpoint
          // - Ping overdue events detected by scheduler
          // - Any other failure conditions
          processedResults.push(current);
        }
      }
      
      return processedResults.map(r => ({
        timestamp: (typeof r.checkedAt === 'string' ? parseISO(r.checkedAt) : r.checkedAt).getTime(),
        status: (r.isUp ? 1 : 0) as (0 | 1),
        label: r.status
      })).reverse();
    } else {
      // For other monitors: show all checks (original behavior)
      return monitor.recentResults.slice(0, 50).map(r => ({
        timestamp: (typeof r.checkedAt === 'string' ? parseISO(r.checkedAt) : r.checkedAt).getTime(),
        status: (r.isUp ? 1 : 0) as (0 | 1),
        label: r.status
      })).reverse();
    }
  }, [monitor.recentResults, monitor.type]);

  // Extract SSL certificate info for website monitors
  const sslCertificateInfo = useMemo(() => {
    console.log("[SSL Debug] Monitor type:", monitor.type);
    console.log("[SSL Debug] Monitor config:", monitor.config);
    console.log("[SSL Debug] Recent results:", monitor.recentResults);
    
    if (monitor.type !== 'website') {
      console.log("[SSL Debug] Not a website monitor, skipping SSL check");
      return null;
    }
    
    if (!monitor.recentResults || monitor.recentResults.length === 0) {
      console.log("[SSL Debug] No recent results available");
      return null;
    }
    
    // Find the most recent result with SSL certificate data
    const resultWithSsl = monitor.recentResults.find(r => {
      console.log("[SSL Debug] Checking result:", r.id, "Details:", r.details);
      return r.details && 
        typeof r.details === 'object' && 
        'sslCertificate' in r.details &&
        r.details.sslCertificate;
    });
    
    console.log("[SSL Debug] Result with SSL:", resultWithSsl);
    
    if (!resultWithSsl || !resultWithSsl.details || !('sslCertificate' in resultWithSsl.details)) {
      console.log("[SSL Debug] No SSL certificate data found");
      return null;
    }
    
    const sslCert = resultWithSsl.details.sslCertificate as any;
    console.log("[SSL Debug] SSL Certificate data:", sslCert);
    
    return {
      validTo: sslCert.validTo,
      daysRemaining: sslCert.daysRemaining,
      valid: sslCert.valid,
      issuer: sslCert.issuer,
      subject: sslCert.subject
    };
  }, [monitor.type, monitor.recentResults, monitor.config]);

  // Debug alert configuration
  console.log("[Alert Debug] Monitor alertConfig:", monitor.alertConfig);
  console.log("[Alert Debug] Alert enabled:", monitor.alertConfig?.enabled);

  // Pagination logic for recent results (use filtered results)
  const paginatedResults = useMemo(() => {
    if (!filteredResults) return [];
    const startIndex = (currentPage - 1) * resultsPerPage;
    const endIndex = startIndex + resultsPerPage;
    return filteredResults.slice(startIndex, endIndex);
  }, [filteredResults, currentPage, resultsPerPage]);

  const totalPages = Math.ceil((filteredResults?.length || 0) / resultsPerPage);

  // Reset page when date filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate]);

  const clearDateFilter = () => {
    setSelectedDate(undefined);
    setIsCalendarOpen(false);
  };

  return (
    <div className="container py-4 px-4 md:px-4 ">
      
      {/* Status and Type Header */}
      <div className="border rounded-lg p-2 mb-6 shadow-sm bg-card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="icon"
              className="h-8 w-8"
              onClick={() => router.push('/monitors')}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Back to monitors</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {monitorTypeInfo?.icon && <monitorTypeInfo.icon className="h-6 w-6 text-primary" />}
                {monitor.name}
              </h1>
              <div className="text-sm text-muted-foreground truncate max-w-md" title={monitor.url}>
                {monitor.url} 
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {monitor.status === 'paused' && (
              <div className="flex items-center px-2 py-1 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mr-1" />
                <span className="text-xs text-yellow-700 dark:text-yellow-300">Monitoring paused</span>
              </div>
            )}
            
            {/* SSL Certificate Expiry for Website Monitors */}
            {monitor.type === 'website' && sslCertificateInfo && (
              <div className={`flex items-center px-2 py-1 rounded-md border ${
                sslCertificateInfo.daysRemaining <= 7 
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                  : sslCertificateInfo.daysRemaining <= 30
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              }`}>
                <Shield className={`h-4 w-4 mr-1 ${
                  sslCertificateInfo.daysRemaining <= 7 
                    ? 'text-red-600 dark:text-red-400' 
                    : sslCertificateInfo.daysRemaining <= 30
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-green-600 dark:text-green-400'
                }`} />
                <span className={`text-xs ${
                  sslCertificateInfo.daysRemaining <= 7 
                    ? 'text-red-700 dark:text-red-300' 
                    : sslCertificateInfo.daysRemaining <= 30
                    ? 'text-yellow-700 dark:text-yellow-300'
                    : 'text-green-700 dark:text-green-300'
                }`}>
                  SSL: {sslCertificateInfo.daysRemaining}d remaining
                </span>
              </div>
            )}
            
            {/* Debug info for SSL when not showing */}
            {monitor.type === 'website' && !sslCertificateInfo && (
              <div className="flex items-center px-2 py-1 rounded-md border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <Shield className="h-4 w-4 mr-1 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  SSL: No certificate data yet
                </span>
              </div>
            )}
            
            {/* Alert Status Indicator with debug info */}
            <div className={`flex items-center justify-center h-8 w-8 rounded-full ${
              monitor.alertConfig?.enabled 
                ? 'bg-green-100 dark:bg-green-900/30' 
                : 'bg-gray-100 dark:bg-gray-900/30'
            }`}
              title={`Alerts: ${monitor.alertConfig?.enabled ? 'Enabled' : 'Disabled'} - Config: ${JSON.stringify(monitor.alertConfig)}`}
            >
              {monitor.alertConfig?.enabled ? (
                <Bell className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <BellOff className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              )}
            </div>
            
            <Button variant="outline" size="sm" onClick={handleToggleStatus}>
              {monitor.status === 'paused' ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
              {monitor.status === 'paused' ? 'Resume' : 'Pause'}
            </Button>
           
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push(`/monitors/${monitor.id}/edit`)}
              className="flex items-center"
            >
              <Edit3 className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="flex items-center text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/50"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </div>
        </div>

        <div className={`grid gap-4 mt-4 ${monitor.type === "heartbeat" ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-5" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"}`}>
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <StatusHeaderIcon status={currentActualStatus} />
              <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-lg font-semibold">
                {statusInfo?.label ?? currentActualStatus?.charAt(0).toUpperCase() + currentActualStatus?.slice(1) ?? "Unknown"}
              </div>
            </CardContent>
          </Card>

          {monitor.type === "heartbeat" ? (
            <>
              <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
                <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
                  <Clock className="h-5 w-5 text-purple-500" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Expected Interval</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <div className="text-lg font-semibold">{(monitor as any).config?.expectedIntervalMinutes ? `${(monitor as any).config.expectedIntervalMinutes}m` : "60m"}</div>
                </CardContent>
              </Card>

              <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
                <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
                  <ShieldCheck className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Grace Period</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <div className="text-xl font-bold">{(monitor as any).config?.gracePeriodMinutes ? `${(monitor as any).config.gracePeriodMinutes}m` : "10m"}</div>
                </CardContent>
              </Card>

              <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
                <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
                  <Activity className="h-5 w-5 text-green-500" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Last Ping</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <div className="text-lg font-semibold">
                    {formatShortDateTime((monitor as any).config?.lastPingAt)}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
                <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
                  <Activity className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Response Time</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <div className="text-lg font-semibold">{currentResponseTime}</div>
                </CardContent>
              </Card>

              <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
                <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
                  <Clock className="h-5 w-5 text-purple-500" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Interval</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <div className="text-lg font-semibold">{monitor.frequencyMinutes ? `${monitor.frequencyMinutes}m` : "N/A"}</div>
                </CardContent>
              </Card>
            </>
          )}

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Uptime (24h)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-lg font-semibold">{calculatedMetrics.uptime24h}</div>
            </CardContent>
          </Card>
          

          {monitor.type !== "heartbeat" && (
            <>
              <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
                <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
                  <Zap className="h-5 w-5 text-amber-400" /> 
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Resp (24h)</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <div className="text-lg font-semibold">{calculatedMetrics.avgResponse24h}</div>
                </CardContent>
              </Card>

              <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
                <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">Uptime (30d)</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <div className="text-lg font-semibold">{calculatedMetrics.uptime30d}</div>
                </CardContent>
              </Card>

              <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-24">
                <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
                  <Zap className="h-5 w-5 text-amber-400" /> 
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Resp (30d)</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                  <div className="text-lg font-semibold">{calculatedMetrics.avgResponse30d}</div>
                </CardContent>
              </Card>

       
              
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" >
        {monitor.type === "heartbeat" ? (
          <>
            {/* Left column - Availability Chart */}
            <div className="flex flex-col space-y-6 h-full">
              <div className="flex-1">
                <AvailabilityBarChart data={availabilityTimelineData} monitorType={monitor.type} />
              </div>
              
              {/* Heartbeat Configuration */}
              <Card className="shadow-sm flex-1">
                <CardHeader>
                  <CardTitle className="text-2xl">Heartbeat Configuration</CardTitle>
                  <CardDescription>
                    Passive monitoring expecting regular pings from your services
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Heartbeat URLs */}
                  <div className="space-y-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground mt-5">
                      Use these URLs to send pings from your services, scripts, or cron jobs
                    </p>

                    {/* Success URL */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Success URL</label>
                      <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg group">
                        <code className="flex-1 text-sm font-mono break-all">
                          {(monitor as any).config?.heartbeatUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/heartbeat/${monitor.id}`}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const url = (monitor as any).config?.heartbeatUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/heartbeat/${monitor.id}`;
                            navigator.clipboard.writeText(url);
                            toast.success("URL copied to clipboard");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Failure URL */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Failure URL</label>
                      <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg group mb-5" >
                        <code className="flex-1 text-sm font-mono break-all">
                          {(monitor as any).config?.heartbeatUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/heartbeat/${monitor.id}`}/fail
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const url = `${(monitor as any).config?.heartbeatUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/heartbeat/${monitor.id}`}/fail`;
                            navigator.clipboard.writeText(url);
                            toast.success("URL copied to clipboard");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right column - Recent Check Results */}
            <Card className="shadow-sm flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl flex items-center">
                    Recent Check Results
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {selectedDate && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearDateFilter}
                        className="h-8"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {selectedDate ? format(selectedDate, 'MMM dd') : 'Filter by date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <CalendarComponent
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date: Date | undefined) => {
                            setSelectedDate(date);
                            setIsCalendarOpen(false);
                          }}
                          disabled={(date: Date) =>
                            date > new Date() || date < new Date("2020-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <CardDescription>
                  {selectedDate 
                    ? `Showing ${paginatedResults.length} of ${filteredResults?.length || 0} checks for ${format(selectedDate, 'MMMM dd, yyyy')}`
                    : `Showing ${paginatedResults.length} of ${filteredResults?.length || 0} recent checks.`
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col">
                {filteredResults && filteredResults.length > 0 ? (
                  <div className="flex-1 overflow-y-auto">
                    <div className="w-full">
                      <table className="w-full divide-y divide-border">
                        <thead className="bg-background sticky top-0 z-10 border-b">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">Result</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Checked At</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Details</th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {paginatedResults.map((result) => (
                            <tr key={result.id} className="hover:bg-muted/25">
                              <td className="px-4 py-3 whitespace-nowrap text-sm w-20">
                                <div className="flex items-center gap-2">
                                  <SimpleStatusIcon isUp={result.isUp} />
                                  {monitor.type === "heartbeat" && result.isStatusChange && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                      Status Change
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(result.checkedAt)}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {result.isUp ? (
                                  <span className="text-muted-foreground text-xs">
                                    {result.details?.message || "Ping received"}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs truncate max-w-[150px]" title={result.details?.errorMessage || "No ping within expected interval"}>
                                    {(() => {
                                      const errorMsg = result.details?.errorMessage || "No ping within expected interval";
                                      // Simplify heartbeat error messages for better UX
                                      if (errorMsg.includes('Waiting for initial heartbeat ping')) {
                                        return 'Waiting for first ping';
                                      }
                                      if (errorMsg.includes('No ping received within expected interval')) {
                                        return 'Ping overdue';
                                      }
                                      if (errorMsg.includes('No initial ping received')) {
                                        return 'No initial ping';
                                      }
                                      return errorMsg;
                                    })()}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No check results available</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Heartbeat monitors use passive monitoring. Send a ping to the URL above to generate results.
                      </p>
                    </div>
                  </div>
                )}
                {filteredResults && filteredResults.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t flex-shrink-0 bg-card rounded-b-lg">
                    <div className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          // For other monitors, show charts and results in two columns
          <>
            <div className="flex flex-col space-y-6 ">
              {/* Availability Chart */}
              <div className="flex-1">
                <AvailabilityBarChart data={availabilityTimelineData} monitorType={monitor.type} />
              </div>

              {/* Response Time Chart */}
              <div className="flex-1">
                <ResponseTimeBarChart data={responseTimeData} />
              </div>
            </div>

            <Card className="shadow-sm flex flex-col">
              <CardHeader className="flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl flex items-center">
                    Recent Check Results
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {selectedDate && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearDateFilter}
                        className="h-8"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                    <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8">
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {selectedDate ? format(selectedDate, 'MMM dd') : 'Filter by date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <CalendarComponent
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date: Date | undefined) => {
                            setSelectedDate(date);
                            setIsCalendarOpen(false);
                          }}
                          disabled={(date: Date) =>
                            date > new Date() || date < new Date("2020-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <CardDescription>
                  {selectedDate 
                    ? `Showing ${paginatedResults.length} of ${filteredResults?.length || 0} checks for ${format(selectedDate, 'MMMM dd, yyyy')}`
                    : `Showing ${paginatedResults.length} of ${filteredResults?.length || 0} recent checks.`
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex-1 flex flex-col ">
                {filteredResults && filteredResults.length > 0 ? (
                  <div className="flex-1 overflow-y-auto">
                    <div className="w-full">
                      <table className="w-full divide-y divide-border">
                        <thead className="bg-background sticky top-0 z-10 border-b">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-20">Result</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Checked At</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-46">Response Time (ms)</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Error</th>
                          </tr>
                        </thead>
                        <tbody className="bg-card divide-y divide-border">
                          {paginatedResults.map((result) => (
                            <tr key={result.id} className="hover:bg-muted/25">
                              <td className="px-4 py-3 whitespace-nowrap text-sm w-20">
                                <SimpleStatusIcon isUp={result.isUp} />
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(result.checkedAt)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground w-32">
                                {result.responseTimeMs !== null && result.responseTimeMs !== undefined ? result.responseTimeMs : 'N/A'}
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {result.isUp ? (
                                  <span className="text-muted-foreground text-xs">N/A</span>
                                ) : (
                                  <span 
                                    className="text-muted-foreground text-xs cursor-help block truncate max-w-[150px]" 
                                    title={result.details?.errorMessage || 'Check failed'}
                                  >
                                    {(() => {
                                      const errorMsg = result.details?.errorMessage || 'Check failed';
                                      // Truncate long messages
                                      return errorMsg.length > 30 ? errorMsg.substring(0, 27) + '...' : errorMsg;
                                    })()}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-muted-foreground">No check results available</p>
                      <p className="text-sm text-muted-foreground mt-1">Check results will appear here once monitoring begins.</p>
                    </div>
                  </div>
                )}
                {filteredResults && filteredResults.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t flex-shrink-0 bg-card rounded-b-lg">
                    <div className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the monitor
              &quot;{monitor.name}&quot; and all its associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 