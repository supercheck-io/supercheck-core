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

interface RunDetailsProps {
  run: RunResponse;
}

export function RunDetails({ run }: RunDetailsProps) {
  const [reportUrl, setReportUrl] = useState('');
  const [currentStatus, setCurrentStatus] = useState(run.status);
  
  useEffect(() => {
    if (run.reportUrl) {
      // Use the API proxy with direct UUID format instead of /jobs/ prefix
      const apiUrl = `/api/test-results/${run.id}/report/index.html?t=${Date.now()}`;
      console.log(`Setting report URL to API proxy: ${apiUrl} (original: ${run.reportUrl})`);
      setReportUrl(apiUrl);
    } else {
      // If no report URL, still try to use the test-results API with direct UUID
      setReportUrl(`/api/test-results/${run.id}/report/index.html?t=${Date.now()}`);
    }
    setCurrentStatus(run.status);
  }, [run.reportUrl, run.status, run.id]);

  // Handle status updates from SSE
  const handleStatusUpdate = (status: string, newReportUrl?: string) => {
    console.log(`Status update: ${status}, reportUrl: ${newReportUrl}`);
    
    if (status !== currentStatus) {
      setCurrentStatus(status);
    }
    
    if (newReportUrl) {
      // Regardless of the reportUrl from SSE, use our API proxy with direct UUID
      const apiUrl = `/api/test-results/${run.id}/report/index.html?t=${Date.now()}`;
      console.log(`Setting report URL after SSE update: ${apiUrl}`);
      setReportUrl(apiUrl);
    }
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

  return (
    <div className="container mx-auto space-y-4 p-4">
      {/* Status listener for real-time updates */}
      <RunStatusListener 
        runId={run.id} 
        jobId={run.jobId} 
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
              <div className="text-sm text-muted-foreground flex items-center gap-1 ml-1">
                <CalendarIcon className="h-3 w-3" />
                <span>
                  {run.startedAt || run.timestamp
                    ? formatDistanceToNow(new Date(run.startedAt || run.timestamp), {
                        addSuffix: true,
                      })
                    : "Unknown time"}
                </span>
              
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