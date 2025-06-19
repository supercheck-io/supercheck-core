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
import { Monitor as MonitorSchemaType } from "./schema";
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
      
      if (newStatus === 'paused') {
        toast.success(`Monitor "${monitor.name}" has been paused. Checks will stop running.`);
      } else {
        toast.success(`Monitor "${monitor.name}" has been resumed. Checks will start running again.`);
      }
    } catch (error) {
      console.error("Error toggling monitor status:", error);
      toast.error((error as Error).message || "Could not update monitor status.");
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
  const monitorTypeInfo = monitorTypes.find((t) => t.value === monitor.method);

  console.log("[MonitorDetailClient] Status Info (for display):", statusInfo);
  console.log("[MonitorDetailClient] Monitor Type Info (for icon):", monitorTypeInfo);

  const currentResponseTime = latestResult && latestResult.responseTimeMs !== undefined && latestResult.responseTimeMs !== null ? `${latestResult.responseTimeMs} ms` : "N/A";

  // Prepare data for AvailabilityBarChart, same as statusHistoryData but ensure 0|1 status
  const availabilityTimelineData = useMemo(() => {
    if (!monitor.recentResults || monitor.recentResults.length === 0) return [];
    return monitor.recentResults.slice(0, 50).map(r => ({
        timestamp: (typeof r.checkedAt === 'string' ? parseISO(r.checkedAt) : r.checkedAt).getTime(),
        status: (r.isUp ? 1 : 0) as (0 | 1),
        label: r.status
    })).reverse(); 
  }, [monitor.recentResults]);

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
    <div className="container py-4 px-4 md:px-4 h-full">
      
      {/* Status and Type Header */}
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
          
          <div className="flex items-center gap-2">
            {monitor.status === 'paused' && (
              <div className="flex items-center px-2 py-1 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mr-1" />
                <span className="text-xs text-yellow-700 dark:text-yellow-300">Monitoring paused</span>
              </div>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleToggleStatus}
              className="flex items-center"
            >
              {monitor.status === 'paused' ? (
                <>
                  <Play className="h-4 w-4 mr-1 text-green-600" />
                  <span className="hidden sm:inline">Resume</span>
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-1 text-orange-500" />
                  <span className="hidden sm:inline">Pause</span>
                </>
              )}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 mt-4">
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <StatusHeaderIcon status={currentActualStatus} />
              <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">
                {statusInfo?.label ?? currentActualStatus?.charAt(0).toUpperCase() + currentActualStatus?.slice(1) ?? "Unknown"}
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
              <Clock className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Interval</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">{monitor.frequencyMinutes ? `${monitor.frequencyMinutes}m` : "N/A"}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Uptime (24h)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">{calculatedMetrics.uptime24h}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <Zap className="h-5 w-5 text-amber-400" /> 
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Resp (24h)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">{calculatedMetrics.avgResponse24h}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <CardTitle className="text-sm font-medium text-muted-foreground">Uptime (30d)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">{calculatedMetrics.uptime30d}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-2 pt-3 px-4">
              <Zap className="h-5 w-5 text-amber-400" /> 
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Resp (30d)</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-2xl font-bold">{calculatedMetrics.avgResponse30d}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-full flex flex-col space-y-6">
          {/* Availability Chart */}
          <AvailabilityBarChart data={availabilityTimelineData} />

          {/* Response Time Chart */}
          <div className="flex-1 max-h-[400px]">
            <ResponseTimeBarChart data={responseTimeData} />
          </div>
        </div>

        <Card className="shadow-sm h-full flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl flex items-center">
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
              <div className="flex-1">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Checked At</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Response Time (ms)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {paginatedResults.map((result) => (
                      <tr key={result.id} className="hover:bg-muted/25">
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <SimpleStatusIcon isUp={result.isUp} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(result.checkedAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                          {result.responseTimeMs !== null && result.responseTimeMs !== undefined ? result.responseTimeMs : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-center text-sm text-muted-foreground">
                  {selectedDate ? `No check results found for ${format(selectedDate, 'MMMM dd, yyyy')}.` : "No recent check results found."}
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-center py-2 border-t">
            <Pagination>
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className={cn(
                      "h-8 px-3 text-sm",
                      currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                    )}
                  />
                </PaginationItem>
                
                {/* Show page numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else {
                    // Show current page in the middle when possible
                    if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                  }
                  
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => setCurrentPage(pageNum)}
                        isActive={currentPage === pageNum}
                        className="cursor-pointer h-8 w-8 text-sm"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                
                {totalPages > 5 && currentPage < totalPages - 2 && (
                  <PaginationItem>
                    <PaginationEllipsis className="h-8 w-8" />
                  </PaginationItem>
                )}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className={cn(
                      "h-8 px-3 text-sm",
                      currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                    )}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </CardFooter>
        </Card>
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