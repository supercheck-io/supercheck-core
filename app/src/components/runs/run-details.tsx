"use client";

import { useEffect, useState } from "react";
import { RunResponse } from "@/actions/get-runs";
import { Badge } from "@/components/ui/badge";
import { UUIDField } from "@/components/ui/uuid-field";
import { runStatuses } from "./data";
import { toast } from "sonner";
import { ReportViewer } from "@/components/shared/report-viewer";
import { formatDistanceToNow } from "date-fns";
import { CalendarIcon, ClockIcon } from "lucide-react";
import { RunStatusListener } from "./run-status-listener";
import { TestRunStatus } from "@/db/schema/schema";

interface RunDetailsProps {
  run: RunResponse;
}

export function RunDetails({ run }: RunDetailsProps) {
  const [reportUrl, setReportUrl] = useState('');
  const [duration, setDuration] = useState<string | undefined>(run.duration || undefined);

  // Helper to validate status is one of the allowed values
  const mapStatusForDisplay = (status: string): TestRunStatus => {
    const statusLower = status.toLowerCase();
    
    switch(statusLower) {
      case 'running':
        return 'running';
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'error':
        return 'error';
      default:
        console.warn(`Unknown status: ${status}, defaulting to running`);
        return 'running';
    }
  };
  
  const [currentStatus, setCurrentStatus] = useState<TestRunStatus>(mapStatusForDisplay(run.status as TestRunStatus));
  
  useEffect(() => {
    if (run.reportUrl) {
      // Use the API proxy with direct UUID format instead of /jobs/ prefix
      const apiUrl = `/api/test-results/${run.id}/report/index.html?t=${Date.now()}`;
      console.log(`Setting report URL to API proxy: ${apiUrl} (original: ${run.reportUrl})`);
      setReportUrl(apiUrl);
    } else {
      // If no report URL, still try to use the test-results API with direct UUID
      const apiUrl = `/api/test-results/${run.id}/report/index.html?t=${Date.now()}`;
      console.log(`No direct reportUrl, trying API proxy path: ${apiUrl}`);
      setReportUrl(apiUrl);
    }
    
    // Always update status and duration regardless of reportUrl
    setCurrentStatus(mapStatusForDisplay(run.status as TestRunStatus));
    setDuration(run.duration || undefined);
    
    // No need for refresh timer since we're using SSE for real-time updates
  }, [run.reportUrl, run.status, run.id, run.duration]);

  // Format the duration for display
  const formatDuration = (durationStr?: string) => {
    if (!durationStr) return "Unknown";
    
    // If it's already a nicely formatted string like "3s" or "1m 30s", just return it
    if (typeof durationStr === 'string' && (durationStr.includes('s') || durationStr.includes('m'))) {
      return durationStr;
    }
    
    // Try to parse as number of seconds
    const seconds = parseInt(durationStr, 10);
    if (!isNaN(seconds)) {
      if (seconds === 0) return "< 1s"; // Show something meaningful for zero seconds
      
      // Format seconds into a readable string
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      
      if (minutes > 0) {
        return `${minutes}m ${remainingSeconds > 0 ? `${remainingSeconds}s` : ''}`.trim();
      } else {
        return `${seconds}s`;
      }
    }
    
    // If we can't parse it, just return the original string
    return durationStr;
  };

  const getStatusBadge = (status: string) => {
    const statusInfo = runStatuses.find((s) => s.value === status);
    if (!statusInfo) return null;

    return (
      <Badge
        variant="outline"
        className={`${statusInfo.color} text-[16px] font-medium px-2 py-1`}
      >
        {statusInfo.icon && <statusInfo.icon className="mr-1 h-3 w-3" />}
        {statusInfo.label}
      </Badge>
    );
  };

  // Handle status updates from SSE
  const handleStatusUpdate = (status: string, newReportUrl?: string, newDuration?: string) => {
    console.log(`Status update: ${status}, reportUrl: ${newReportUrl}, duration: ${newDuration}`);
    
    if (status !== currentStatus) {
      setCurrentStatus(mapStatusForDisplay(status as TestRunStatus));
    }
    
    if (newReportUrl) {
      // Regardless of the reportUrl from SSE, use our API proxy with direct UUID
      const apiUrl = `/api/test-results/${run.id}/report/index.html?t=${Date.now()}`;
      console.log(`Setting report URL after SSE update: ${apiUrl}`);
      setReportUrl(apiUrl);
    }

    // Update duration if it changed
    if (newDuration && newDuration !== duration) {
      console.log(`Updating duration from ${duration} to ${newDuration}`);
      setDuration(newDuration);
    }
  };

  return (
    <div className="container mx-auto space-y-4 p-4">
      {/* Status listener for real-time updates */}
      <RunStatusListener 
        runId={run.id} 
        status={run.status}
        onStatusUpdate={handleStatusUpdate}
      />
      
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="p-6">
          {/* Flex container for heading and details */}
          <div className="flex items-start justify-between"> 
            {/* Left side: Heading and time */}
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Job Run Details
                {getStatusBadge(currentStatus)}
              </h1>
              <div className="flex gap-3">
                <div className="text-sm text-muted-foreground flex items-center gap-1 ml-1">
                  <CalendarIcon className="h-3 w-3" />
                  <span>
                    {(run.startedAt || run.timestamp)
                      ? formatDistanceToNow(new Date(run.startedAt || run.timestamp || ''), {
                          addSuffix: true,
                        })
                      : "Unknown time"}
                  </span>
                </div>
                {duration && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1 ml-1">
                    <ClockIcon className="h-3 w-3" />
                    <span>{formatDuration(duration)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right side: Run ID and Job Details */}
            <div className="flex flex-row gap-6">
              <div>
                <span className="text-xs font-medium text-muted-foreground block">Run ID</span>
                <UUIDField 
                  value={run.id} 
                  className="text-sm font-medium font-mono"
                  onCopy={() => toast.success("Run ID copied to clipboard")}
                />
              </div>
              
              <div>
                <span className="text-xs font-medium text-muted-foreground block">Job</span>
                <div className="font-medium max-w-[300px] truncate overflow-hidden text-ellipsis whitespace-nowrap">{run.jobName || "Unknown Job"}</div>
                <UUIDField 
                  value={run.jobId} 
                  className="text-xs text-muted-foreground font-mono"
                  onCopy={() => toast.success("Job ID copied to clipboard")}
                />
              </div>
            </div>
          </div> {/* End of flex container */}
        </div>

        {/* Use the shared ReportViewer component */}
        <div className="w-full border-t">
          <ReportViewer
            reportUrl={reportUrl}
            isRunning={currentStatus === "running"}
            backToLabel="Back to Runs"
            backToUrl="/runs"
            containerClassName="w-full h-[calc(100vh-220px)] relative"
            iframeClassName="w-full h-full border-0"
            darkMode={false}
            hideEmptyMessage={true}
          />
        </div>
      </div>
    </div>
  );
} 