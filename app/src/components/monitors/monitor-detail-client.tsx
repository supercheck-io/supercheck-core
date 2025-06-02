"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  Edit, 
  Globe, 
  ArrowUpRight, 
  Activity,
  CheckCircle2,
  CheckCircle,
  Clock,
  CalendarIcon,
  Calendar as CalendarIcon2,
  Trash2,
  MoreHorizontal,
  Edit3,
  Play,
  Pause,
  BarChart2,
  ListChecks,
  Zap,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { monitorStatuses, monitorTypes } from "@/components/monitors/data";
import { Monitor as MonitorSchemaType } from "./schema";
import { formatDistanceToNow, format, addDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ResponseTimeBarChart } from "@/components/monitors/response-time-bar-chart";
import { MonitorChart, MonitorChartDataPoint } from "./monitor-chart";
import { AvailabilityBarChart } from "./AvailabilityBarChart";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonitorStatusIndicator } from "./monitor-status-indicator";
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
}

export type MonitorWithResults = MonitorSchemaType & {
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

export function MonitorDetailClient({ monitor: initialMonitor }: MonitorDetailClientProps) {
  const router = useRouter();
  const [monitor, setMonitor] = useState<MonitorWithResults>(initialMonitor);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  console.log("[MonitorDetailClient] Initial Monitor Prop:", initialMonitor);

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
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update monitor status");
      }
      const updatedMonitorData: MonitorWithResults = await response.json();
      setMonitor(prev => ({...prev, ...updatedMonitorData}));
      toast.success(`Monitor "${monitor.name}" status updated to ${newStatus}.`);
    } catch (error) {
      console.error("Error toggling monitor status:", error);
      toast.error((error as Error).message || "Could not update monitor status.");
    }
  };

  const responseTimeData = useMemo(() => {
    if (!monitor.recentResults || monitor.recentResults.length === 0) return [];
    return monitor.recentResults
      .map(r => ({ 
        name: formatDateTime(r.checkedAt),
        time: r.responseTimeMs || 0 
      }))
      .reverse();
  }, [monitor.recentResults]);
  
  const statusHistoryData: MonitorChartDataPoint[] = useMemo(() => {
    if (!monitor.recentResults || monitor.recentResults.length === 0) return [];
    return monitor.recentResults.map(r => ({
        timestamp: (typeof r.checkedAt === 'string' ? parseISO(r.checkedAt) : r.checkedAt).getTime(),
        status: r.isUp ? 1 : 0, 
        label: r.status,
        responseTime: r.responseTimeMs
    })).reverse(); 
  }, [monitor.recentResults]);

  const latestResult = monitor.recentResults && monitor.recentResults.length > 0 ? monitor.recentResults[0] : null;
  const currentActualStatus = latestResult ? (latestResult.isUp ? 'up' : 'down') : monitor.status;

  console.log("[MonitorDetailClient] Latest Result:", latestResult);
  console.log("[MonitorDetailClient] Current Actual Status:", currentActualStatus);

  const statusInfo = monitorStatuses.find((s) => s.value === currentActualStatus);
  const monitorTypeInfo = monitorTypes.find((t) => t.value === monitor.method);

  console.log("[MonitorDetailClient] Status Info (for display):", statusInfo);
  console.log("[MonitorDetailClient] Monitor Type Info (for icon):", monitorTypeInfo);

  const avgResponse24h = "N/A";
  const uptime30d = "N/A";
  const currentResponseTime = latestResult && latestResult.responseTimeMs !== undefined && latestResult.responseTimeMs !== null ? `${latestResult.responseTimeMs} ms` : "N/A";
  const uptime24h = "N/A";

  // Prepare data for AvailabilityBarChart, same as statusHistoryData but ensure 0|1 status
  const availabilityTimelineData = useMemo(() => {
    if (!monitor.recentResults || monitor.recentResults.length === 0) return [];
    return monitor.recentResults.map(r => ({
        timestamp: (typeof r.checkedAt === 'string' ? parseISO(r.checkedAt) : r.checkedAt).getTime(),
        status: (r.isUp ? 1 : 0) as (0 | 1),
        label: r.status
    })).reverse(); 
  }, [monitor.recentResults]);

  return (
    <div className="container py-6 px-4 md:px-6 h-full overflow-hidden">
      <div className="border rounded-lg p-4 mb-6 shadow-sm bg-card">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto">
                <MoreHorizontal className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Actions</span>
                <span className="sr-only sm:hidden">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Monitor Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push(`/monitors/${monitor.id}/edit`)}>
                <Edit3 className="mr-2 h-4 w-4" />
                <span>Edit Monitor</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleStatus}>
                {monitor.status === 'paused' ? (
                    <><Play className="mr-2 h-4 w-4" /><span>Resume Checks</span></>
                ) : (
                    <><Pause className="mr-2 h-4 w-4" /><span>Pause Checks</span></>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-red-600 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-900/50">
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete Monitor</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <MonitorStatusIndicator status={currentActualStatus as DBMoniotorStatusType} monitorId={monitor.id} />
                <div className="text-2xl font-bold">
                  {statusInfo?.label ?? currentActualStatus?.charAt(0).toUpperCase() + currentActualStatus?.slice(1) ?? "Unknown"}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <Activity className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Response</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">{currentResponseTime}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Uptime (24h)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">{uptime24h}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <Zap className="h-5 w-5 text-orange-500" /> 
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Response (24h)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">{avgResponse24h}</div>
            </CardContent>
          </Card>

           <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <ShieldCheck className="h-5 w-5 text-indigo-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Uptime (30d)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">{uptime30d}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* New Availability Chart Card */}
          <AvailabilityBarChart data={availabilityTimelineData} />

          {/* Original Response Time Overview Card (now below the new availability chart) */}
          <Card>
            <ResponseTimeBarChart data={responseTimeData} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl flex items-center">
                <ListChecks className="mr-2 h-5 w-5" />
                Recent Check Results
              </CardTitle>
              <CardDescription>
                Showing the last {monitor.recentResults?.length || 0} checks for this monitor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {monitor.recentResults && monitor.recentResults.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Checked At</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Response Time (ms)</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">Details</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
                      {monitor.recentResults.map((result) => (
                        <tr key={result.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <MonitorStatusIndicator monitorId={result.monitorId} status={result.status as string} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDateTime(result.checkedAt)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                            {result.responseTimeMs !== null && result.responseTimeMs !== undefined ? result.responseTimeMs : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                            {result.details?.errorMessage || (result.details?.statusCode ? `HTTP ${result.details.statusCode}` : '-')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">No recent check results found.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the monitor
              "{monitor.name}" and all its associated data.
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