"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { canManageMonitors } from "@/lib/rbac/client-permissions";
import { Role } from "@/lib/rbac/permissions";
import { LoadingBadge, Spinner } from "@/components/ui/spinner";
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
  XCircle,
  AlertCircle,
  X,
  Shield,
  Bell,
  BellOff,
  FolderOpen,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { monitorStatuses, monitorTypes } from "@/components/monitors/data";
import { Monitor } from "./schema";
import {
  formatDistanceToNow,
  format,
  parseISO,
  subHours,
  subDays,
} from "date-fns";
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
  MonitorResultDetails as DBMonitorResultDetailsType,
} from "@/db/schema/schema";
import { NavUser } from "@/components/nav-user";
import Link from "next/link";
import { CheckIcon } from "@/components/logo/supercheck-logo";
import { Home } from "lucide-react";
import { TruncatedTextWithTooltip } from "@/components/ui/truncated-text-with-tooltip";

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
  isNotificationView?: boolean;
}

const formatDateTime = (dateTimeInput?: string | Date): string => {
  if (!dateTimeInput) return "N/A";
  try {
    const date =
      typeof dateTimeInput === "string"
        ? parseISO(dateTimeInput)
        : dateTimeInput;
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
    case "up":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "down":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "paused":
      return <Pause className="h-5 w-5 text-gray-500" />;
    default:
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
  }
};

export function MonitorDetailClient({
  monitor: initialMonitor,
  isNotificationView = false,
}: MonitorDetailClientProps) {
  const router = useRouter();
  const [monitor, setMonitor] = useState<MonitorWithResults>(initialMonitor);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [paginatedTableResults, setPaginatedTableResults] = useState<
    MonitorResultItem[]
  >([]);
  const [paginationMeta, setPaginationMeta] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  } | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const resultsPerPage = 10;

  // Function to fetch paginated results
  const fetchPaginatedResults = useCallback(
    async (page: number, dateFilter?: Date) => {
      setIsLoadingResults(true);
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: resultsPerPage.toString(),
        });

        // Add date filter if selected
        if (dateFilter) {
          params.append("date", dateFilter.toISOString().split("T")[0]);
        }

        const response = await fetch(
          `/api/monitors/${monitor.id}/results?${params}`
        );
        if (response.ok) {
          const data = await response.json();
          setPaginatedTableResults(data.data);
          setPaginationMeta(data.pagination);
        } else {
          console.error("Failed to fetch paginated results:", response.status);
        }
      } catch (error) {
        console.error("Error fetching paginated results:", error);
      } finally {
        setIsLoadingResults(false);
      }
    },
    [monitor.id, resultsPerPage]
  );

  console.log("[MonitorDetailClient] Initial Monitor Prop:", initialMonitor);
  console.log("[MonitorDetailClient] Monitor Results:", monitor.recentResults);

  // Fetch user permissions for this monitor
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const response = await fetch(`/api/monitors/${monitor.id}/permissions`);
        if (response.ok) {
          const data = await response.json();
          setUserRole(data.data.userRole || Role.PROJECT_VIEWER);
        } else {
          console.error("Failed to fetch permissions:", response.status);
          setUserRole(Role.PROJECT_VIEWER); // Default to most restrictive role
        }
      } catch (error) {
        console.error("Error fetching permissions:", error);
        setUserRole(Role.PROJECT_VIEWER); // Default to most restrictive role
      } finally {
        setPermissionsLoading(false);
      }
    };

    fetchPermissions();
  }, [monitor.id]);

  useEffect(() => {
    console.log(
      "[MonitorDetailClient] useEffect - initialMonitor changed:",
      initialMonitor
    );
    if (
      initialMonitor &&
      initialMonitor.recentResults &&
      !Array.isArray(initialMonitor.recentResults)
    ) {
      console.warn(
        "[MonitorDetailClient] initialMonitor.recentResults is not an array. Current value:",
        initialMonitor.recentResults
      );
      setMonitor({ ...initialMonitor, recentResults: [] });
    } else {
      setMonitor(initialMonitor);
    }
    // Load initial paginated results
    fetchPaginatedResults(1);
  }, [initialMonitor, fetchPaginatedResults]);

  // Load paginated results when page changes
  useEffect(() => {
    fetchPaginatedResults(currentPage, selectedDate);
  }, [currentPage, selectedDate, fetchPaginatedResults]);

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
    let newStatus: DBMoniotorStatusType =
      monitor.status === "paused" ? "up" : "paused";

    if (
      monitor.status === "paused" &&
      monitor.recentResults &&
      monitor.recentResults.length > 0
    ) {
      newStatus = monitor.recentResults[0].isUp ? "up" : "down";
    }

    try {
      const response = await fetch(`/api/monitors/${monitor.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update monitor status.`);
      }

      const updatedMonitor = await response.json();

      // Update local state immediately for a responsive UI
      setMonitor((prev) => ({ ...prev, ...updatedMonitor, status: newStatus }));
      toast.success(
        `Monitor successfully ${newStatus === "paused" ? "paused" : "resumed"}.`
      );

      // Refresh server-side props to get the latest data
      router.refresh();
    } catch (error) {
      console.error("Error toggling monitor status:", error);
      toast.error(
        (error as Error).message || "Could not update monitor status."
      );
    }
  };

  // Removed unused handleToggleAlerts function

  // Note: Filtering is now handled server-side in the paginated API

  const responseTimeData = useMemo(() => {
    console.log(
      "[ResponseTimeData] Processing monitor results:",
      monitor.recentResults
    );

    if (!monitor.recentResults || monitor.recentResults.length === 0) {
      console.log("[ResponseTimeData] No results available");
      return [];
    }

    // Use the same dataset as availability chart - first 50 results
    const recentResults = monitor.recentResults.slice(0, 50);

    const chartData = recentResults
      .map((r) => {
        const date =
          typeof r.checkedAt === "string" ? parseISO(r.checkedAt) : r.checkedAt;

        return {
          name: format(date, "HH:mm"), // Show only time (HH:MM) for cleaner x-axis
          time: r.responseTimeMs ?? 0, // Use 0 for failed checks (null/undefined response times)
          fullDate: format(date, "MMM dd, HH:mm"), // Keep full date for tooltips
          isUp: r.isUp, // Keep status for conditional styling
          status: r.status,
        };
      })
      .reverse(); // Show chronologically (oldest first)

    console.log("[ResponseTimeData] Final chart data:", chartData);
    return chartData;
  }, [monitor.recentResults]);

  // Calculate uptime and average response time from recent results
  const calculatedMetrics = useMemo(() => {
    if (!monitor.recentResults || monitor.recentResults.length === 0) {
      return {
        uptime24h: "N/A",
        uptime30d: "N/A",
        avgResponse24h: "N/A",
        avgResponse30d: "N/A",
      };
    }

    const now = new Date();
    const last24Hours = subHours(now, 24);
    const last30Days = subDays(now, 30);

    // Filter results by time period
    const results24h = monitor.recentResults.filter((r) => {
      const resultDate =
        typeof r.checkedAt === "string" ? parseISO(r.checkedAt) : r.checkedAt;
      return resultDate >= last24Hours;
    });

    const results30d = monitor.recentResults.filter((r) => {
      const resultDate =
        typeof r.checkedAt === "string" ? parseISO(r.checkedAt) : r.checkedAt;
      return resultDate >= last30Days;
    });

    // Calculate 24h uptime
    const uptime24hPercent =
      results24h.length > 0
        ? (results24h.filter((r) => r.isUp).length / results24h.length) * 100
        : 0;

    // Calculate 30d uptime
    const uptime30dPercent =
      results30d.length > 0
        ? (results30d.filter((r) => r.isUp).length / results30d.length) * 100
        : 0;

    // Calculate average response time for 24h (only for successful checks)
    const validResponseTimes24h = results24h
      .filter(
        (r) =>
          r.isUp && r.responseTimeMs !== null && r.responseTimeMs !== undefined
      )
      .map((r) => r.responseTimeMs!);

    const avgResponse24hMs =
      validResponseTimes24h.length > 0
        ? Math.round(
            validResponseTimes24h.reduce((sum, time) => sum + time, 0) /
              validResponseTimes24h.length
          )
        : null;

    // Calculate average response time for 30d (only for successful checks)
    const validResponseTimes30d = results30d
      .filter(
        (r) =>
          r.isUp && r.responseTimeMs !== null && r.responseTimeMs !== undefined
      )
      .map((r) => r.responseTimeMs!);

    const avgResponse30dMs =
      validResponseTimes30d.length > 0
        ? Math.round(
            validResponseTimes30d.reduce((sum, time) => sum + time, 0) /
              validResponseTimes30d.length
          )
        : null;

    return {
      uptime24h:
        results24h.length > 0 ? `${uptime24hPercent.toFixed(1)}%` : "N/A",
      uptime30d:
        results30d.length > 0 ? `${uptime30dPercent.toFixed(1)}%` : "N/A",
      avgResponse24h:
        avgResponse24hMs !== null ? `${avgResponse24hMs} ms` : "N/A",
      avgResponse30d:
        avgResponse30dMs !== null ? `${avgResponse30dMs} ms` : "N/A",
    };
  }, [monitor.recentResults]);

  const latestResult =
    monitor.recentResults && monitor.recentResults.length > 0
      ? monitor.recentResults[0]
      : null;
  const currentActualStatus = latestResult
    ? latestResult.isUp
      ? "up"
      : "down"
    : monitor.status;

  console.log("[MonitorDetailClient] Latest Result:", latestResult);
  console.log(
    "[MonitorDetailClient] Current Actual Status:",
    currentActualStatus
  );

  const statusInfo = monitorStatuses.find(
    (s) => s.value === currentActualStatus
  );
  const monitorTypeInfo = monitorTypes.find((t) => t.value === monitor.type);

  console.log("[MonitorDetailClient] Status Info (for display):", statusInfo);
  console.log(
    "[MonitorDetailClient] Monitor Type Info (for icon):",
    monitorTypeInfo
  );

  const currentResponseTime =
    latestResult &&
    latestResult.responseTimeMs !== undefined &&
    latestResult.responseTimeMs !== null
      ? `${latestResult.responseTimeMs} ms`
      : "N/A";

  // Prepare data for AvailabilityBarChart
  const availabilityTimelineData = useMemo(() => {
    if (!monitor.recentResults || monitor.recentResults.length === 0) return [];

    // Show all checks (original behavior for all monitors)
    return monitor.recentResults
      .slice(0, 50)
      .map((r) => ({
        timestamp: (typeof r.checkedAt === "string"
          ? parseISO(r.checkedAt)
          : r.checkedAt
        ).getTime(),
        status: (r.isUp ? 1 : 0) as 0 | 1,
        label: r.status,
      }))
      .reverse();
  }, [monitor.recentResults]);

  // Extract SSL certificate info for website monitors
  const sslCertificateInfo = useMemo(() => {
    console.log("[SSL Debug] Monitor type:", monitor.type);
    console.log("[SSL Debug] Monitor config:", monitor.config);
    console.log("[SSL Debug] Recent results:", monitor.recentResults);

    if (monitor.type !== "website") {
      console.log("[SSL Debug] Not a website monitor, skipping SSL check");
      return null;
    }

    // Check if SSL checking is currently enabled in monitor config
    const sslCheckEnabled = monitor.config?.enableSslCheck;
    console.log("[SSL Debug] SSL Check enabled in config:", sslCheckEnabled);

    if (!sslCheckEnabled) {
      console.log(
        "[SSL Debug] SSL checking is disabled in monitor config, not showing SSL info"
      );
      return null;
    }

    if (!monitor.recentResults || monitor.recentResults.length === 0) {
      console.log("[SSL Debug] No recent results available");
      return null;
    }

    // Find the most recent result with SSL certificate data
    const resultWithSsl = monitor.recentResults.find((r) => {
      console.log("[SSL Debug] Checking result:", r.id, "Details:", r.details);
      return (
        r.details &&
        typeof r.details === "object" &&
        "sslCertificate" in r.details &&
        r.details.sslCertificate
      );
    });

    console.log("[SSL Debug] Result with SSL:", resultWithSsl);

    if (
      !resultWithSsl ||
      !resultWithSsl.details ||
      !("sslCertificate" in resultWithSsl.details)
    ) {
      console.log("[SSL Debug] No SSL certificate data found");
      return null;
    }

    const sslCert = resultWithSsl.details
      .sslCertificate as DBMonitorResultDetailsType["sslCertificate"];
    console.log("[SSL Debug] SSL Certificate data:", sslCert);

    if (!sslCert) {
      return null;
    }

    return {
      validTo: sslCert.validTo,
      daysRemaining: sslCert.daysRemaining,
      valid: sslCert.valid,
      issuer: sslCert.issuer,
      subject: sslCert.subject,
    };
  }, [monitor.type, monitor.recentResults, monitor.config]);

  // Debug alert configuration
  console.log("[Alert Debug] Monitor alertConfig:", monitor.alertConfig);
  console.log("[Alert Debug] Alert enabled:", monitor.alertConfig?.enabled);

  // Use pagination metadata from API
  const totalPages = paginationMeta?.totalPages || 0;
  const currentResultsCount = paginatedTableResults.length;
  const totalResultsCount = paginationMeta?.total || 0;

  // Reset page when date filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate]);

  const clearDateFilter = () => {
    setSelectedDate(undefined);
    setIsCalendarOpen(false);
  };

  return (
    <div className="h-full">
      {/* Logo, breadcrumbs, and user nav for notification view */}
      {isNotificationView && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <CheckIcon className="h-8 w-8" />
            <div className="flex items-center gap-2 text-sm">
              <Link
                href="/"
                className="text-xl font-semibold text-foreground hover:opacity-80 transition-opacity"
              >
                Supercheck
              </Link>

              <span className="mx-2 text-muted-foreground/30">|</span>
              <Link
                href="/"
                className="flex items-center gap-1 hover:text-foreground transition-colors text-muted-foreground"
              >
                <Home className="h-4 w-4" />
              </Link>
              <span className="mx-1 text-muted-foreground">/</span>
              <span className="text-foreground">Monitor Report</span>
            </div>
          </div>
          <NavUser />
        </div>
      )}

      {/* Status and Type Header */}
      <div className="border rounded-lg p-2 mb-4 shadow-sm bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isNotificationView && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => router.push("/monitors")}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Back to monitors</span>
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2 mt-1">
                {monitorTypeInfo?.icon && (
                  <monitorTypeInfo.icon
                    className={`h-6 w-6 ${monitorTypeInfo.color}`}
                  />
                )}
                {monitor.name.length > 40
                  ? monitor.name.slice(0, 40) + "..."
                  : monitor.name}
              </h1>
              <div
                className="text-sm text-muted-foreground truncate max-w-md"
                title={monitor.url}
              >
                {monitor.type === "port_check" && monitor.config?.port
                  ? `${monitor.target || monitor.url}:${monitor.config.port}`
                  : monitor.type === "http_request" && monitor.config?.method
                  ? `${monitor.config.method.toUpperCase()} ${
                      monitor.url || monitor.target
                    }`
                  : monitor.url || monitor.target}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {monitor.status === "paused" && (
              <div className="flex items-center px-2 py-1 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mr-1" />
                <span className="text-xs text-yellow-700 dark:text-yellow-300">
                  Monitoring paused
                </span>
              </div>
            )}

            {/* Alert Status Indicators */}
            <div className="flex items-center gap-1 ml-1 mr-1">
              {/* Main Alert Status */}
              <div className="relative group mr-1">
                <div
                  className={`flex items-center justify-center h-10 w-10 rounded-full ${
                    monitor.alertConfig?.enabled
                      ? "bg-green-100 dark:bg-green-900/30"
                      : "bg-gray-100 dark:bg-gray-700/30"
                  }`}
                >
                  {monitor.alertConfig?.enabled ? (
                    <Bell className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <BellOff className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  )}
                </div>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                  {monitor.alertConfig?.enabled
                    ? "Alerts enabled"
                    : "Alerts disabled"}
                </div>
              </div>

              {monitor.alertConfig?.enabled && (
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                  {monitor.alertConfig.alertOnFailure && (
                    <div className="relative group">
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-500" />
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                        Monitor failure alert
                      </div>
                    </div>
                  )}
                  {monitor.alertConfig.alertOnRecovery && (
                    <div className="relative group">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                        Monitor recovery alert
                      </div>
                    </div>
                  )}
                  {monitor.alertConfig.alertOnSslExpiration &&
                    monitor.type === "website" &&
                    monitor.config?.enableSslCheck && (
                      <div className="relative group">
                        <Shield className="h-4 w-4 text-blue-600 dark:text-blue-500" />
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                          SSL expiration alert
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* SSL Certificate Expiry for Website Monitors */}
            {monitor.type === "website" &&
              sslCertificateInfo &&
              sslCertificateInfo.daysRemaining !== undefined && (
                <div
                  className={`flex items-center px-2 py-2 rounded-md border ${
                    sslCertificateInfo.daysRemaining <= 7
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                      : sslCertificateInfo.daysRemaining <= 30
                      ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                      : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                  }`}
                  title="SSL enabled"
                >
                  <Shield
                    className={`h-4 w-4 mr-1 ${
                      sslCertificateInfo.daysRemaining <= 7
                        ? "text-red-600 dark:text-red-400"
                        : sslCertificateInfo.daysRemaining <= 30
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-green-600 dark:text-green-400"
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      sslCertificateInfo.daysRemaining <= 7
                        ? "text-red-700 dark:text-red-300"
                        : sslCertificateInfo.daysRemaining <= 30
                        ? "text-yellow-700 dark:text-yellow-300"
                        : "text-green-700 dark:text-green-300"
                    }`}
                  >
                    SSL: {sslCertificateInfo.daysRemaining}d remaining
                  </span>
                </div>
              )}

            {/* Debug info for SSL when enabled but no certificate data */}
            {monitor.type === "website" &&
              monitor.config?.enableSslCheck &&
              !sslCertificateInfo && (
                <div
                  className="flex items-center px-2 py-2 rounded-md border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                  title="SSL enabled but no certificate data available"
                >
                  <Shield className="h-4 w-4 mr-1 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs text-blue-700 dark:text-blue-300">
                    SSL: No certificate data yet
                  </span>
                </div>
              )}

            {/* Action buttons - only show if user has manage permissions and not notification view */}
            {!isNotificationView &&
              !permissionsLoading &&
              userRole &&
              canManageMonitors(userRole) && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleStatus}
                  >
                    {monitor.status === "paused" ? (
                      <Play className="mr-2 h-4 w-4" />
                    ) : (
                      <Pause className="mr-2 h-4 w-4" />
                    )}
                    {monitor.status === "paused" ? "Resume" : "Pause"}
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
                </>
              )}

            {/* Show loading state while fetching permissions - only in non-notification view */}
            {!isNotificationView && permissionsLoading && <LoadingBadge />}

            {/* Show disabled action buttons when user doesn't have management permissions - only in non-notification view */}
            {!isNotificationView &&
              !permissionsLoading &&
              userRole &&
              !canManageMonitors(userRole) && (
                <>
                  <Button variant="outline" size="sm" disabled>
                    {monitor.status === "paused" ? (
                      <Play className="mr-2 h-4 w-4" />
                    ) : (
                      <Pause className="mr-2 h-4 w-4" />
                    )}
                    {monitor.status === "paused" ? "Resume" : "Pause"}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="flex items-center"
                  >
                    <Edit3 className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="flex items-center text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/50"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </>
              )}

            {/* In notification view, just show project name without action buttons */}
            {isNotificationView && monitor.projectName && (
              <div className="flex items-center px-2 py-2 rounded-md border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <FolderOpen className="h-4 w-4 mr-1 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  {monitor.projectName}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 mt-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 m-2">
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-22">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-1 pt-3 px-4">
              <StatusHeaderIcon status={currentActualStatus} />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-semibold">
                {statusInfo?.label ??
                  (currentActualStatus
                    ? currentActualStatus.charAt(0).toUpperCase() +
                      currentActualStatus.slice(1)
                    : "Unknown")}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-22">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-1 pt-3 px-4">
              <Activity className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Response Time
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-semibold">{currentResponseTime}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-22">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-1 pt-3 px-4">
              <Clock className="h-5 w-5 text-purple-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Interval
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-semibold">
                {monitor.frequencyMinutes
                  ? `${monitor.frequencyMinutes}m`
                  : "N/A"}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-22">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-1 pt-3 px-4">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Uptime (24h)
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-semibold">
                {calculatedMetrics.uptime24h}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-22">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-1 pt-3 px-4">
              <Zap className="h-5 w-5 text-sky-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Resp (24h)
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-semibold">
                {calculatedMetrics.avgResponse24h}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-22">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-1 pt-3 px-4">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Uptime (30d)
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-semibold">
                {calculatedMetrics.uptime30d}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 h-22">
            <CardHeader className="flex flex-row items-center justify-start space-x-2 pb-1 pt-3 px-4">
              <Zap className="h-5 w-5 text-sky-500" />
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Resp (30d)
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-semibold">
                {calculatedMetrics.avgResponse30d}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* For all monitors, show charts and results in two columns */}
        <div className="flex flex-col space-y-6 ">
          {/* Availability Chart */}
          <div className="flex-1">
            <AvailabilityBarChart
              data={availabilityTimelineData}
              monitorType={monitor.type}
            />
          </div>

          {/* Response Time Chart */}
          <div className="flex-1 -mt-2">
            <ResponseTimeBarChart data={responseTimeData} />
          </div>
        </div>

        <Card className="shadow-sm flex flex-col">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center">
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
                      {selectedDate
                        ? format(selectedDate, "MMM dd")
                        : "Filter by date"}
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
                ? `Showing ${currentResultsCount} of ${totalResultsCount} checks for ${format(
                    selectedDate,
                    "MMMM dd, yyyy"
                  )}`
                : `Showing ${currentResultsCount} of ${totalResultsCount} recent checks.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto" style={{ height: "400px" }}>
              <div className="w-full">
                <table className="w-full divide-y divide-border table-fixed">
                  <thead className="bg-background sticky top-0 z-10 border-b">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        style={{ width: "80px" }}
                      >
                        Result
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        style={{ width: "180px" }}
                      >
                        Checked At
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                        style={{ width: "180px" }}
                      >
                        Response Time (ms)
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      >
                        Error
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {isLoadingResults ? (
                      // Loading state
                      <tr>
                        <td colSpan={4} className="text-center" style={{ height: '320px' }}>
                          <div className="flex items-center justify-center h-full">
                            <Spinner size="md" />
                          </div>
                        </td>
                      </tr>
                    ) : paginatedTableResults &&
                    paginatedTableResults.length > 0 ? (
                      paginatedTableResults.map((result) => (
                        <tr key={result.id} className="hover:bg-muted/25">
                          <td className="px-4 py-[11.5px] whitespace-nowrap text-sm">
                            <SimpleStatusIcon isUp={result.isUp} />
                          </td>
                          <td className="px-4 py-[11.5px] whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(result.checkedAt)}
                          </td>
                          <td className="px-4 py-[11.5px] whitespace-nowrap text-sm text-muted-foreground">
                            {result.responseTimeMs !== null &&
                            result.responseTimeMs !== undefined
                              ? result.responseTimeMs
                              : "N/A"}
                          </td>
                          <td className="px-4 py-[11.5px] text-sm text-muted-foreground">
                            {result.isUp ? (
                              <span className="text-muted-foreground text-xs">
                                N/A
                              </span>
                            ) : (
                              <TruncatedTextWithTooltip
                                text={
                                  result.details?.errorMessage || "Check failed"
                                }
                                className="text-muted-foreground text-xs"
                                maxWidth="150px"
                                maxLength={30}
                              />
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      // Empty state
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center">
                          <div className="text-center">
                            <p className="text-muted-foreground">
                              No check results available
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Check results will appear here once monitoring
                              begins.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {!isLoadingResults &&
              paginatedTableResults &&
              paginatedTableResults.length > 0 &&
              paginationMeta && (
                <div className="flex items-center justify-between px-4 py-3 border-t flex-shrink-0 bg-card rounded-b-lg">
                  <div className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              monitor &quot;{monitor.name}&quot; and all its associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Deleting...
                </div>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
