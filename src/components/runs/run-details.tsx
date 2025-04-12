"use client";

import React, { useState } from "react";
import { RunResponse } from "@/actions/get-runs";
import { Badge } from "@/components/ui/badge";
import { runStatuses } from "./data";
import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";

interface RunDetailsProps {
  run: RunResponse;
}

export function RunDetails({ run }: RunDetailsProps) {
  const [isReportLoading, setIsReportLoading] = useState(!!run.reportUrl);

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Runs", href: "/runs" },
    { label: run.id, isCurrentPage: true },
  ];

  const getStatusBadge = (status: string) => {
    const statusInfo = runStatuses.find((s) => s.value === status);
    if (!statusInfo) return null;

    return (
      <Badge
        variant="outline"
        className={`${statusInfo.color} border-${statusInfo.color.replace(
          "text-",
          ""
        )}`}
      >
        {statusInfo.icon && <statusInfo.icon className="mr-1 h-3 w-3" />}
        {statusInfo.label}
      </Badge>
    );
  };

  return (
    <div className="w-full py-2 px-4">
      <div className="flex flex-col space-y-2">
        {/* Breadcrumbs */}
        <PageBreadcrumbs items={breadcrumbs} />

        {/* Ultra Compact Header Card */}
        <div className="bg-card p-3 rounded-lg border border-border/40 mb-4">
          {/* Two-column layout with title on left and details on right */}
          <div className="flex flex-wrap justify-between items-start">
            {/* Title and subtitle */}
            <div className="mr-4">
              <h1 className="text-2xl font-bold tracking-tight">Run Details</h1>
              <p className="text-muted-foreground text-md mt-1">Job execution results</p>
            </div>
            
            {/* Right-aligned sections */}
            <div className="flex flex-wrap gap-6 items-start">
              {/* Status */}
              <div>
                <span className="text-xs font-medium text-muted-foreground block">Status</span>
                <div className="mt-1">{getStatusBadge(run.status)}</div>
              </div>
              
              {/* Run ID */}
              <div>
                <span className="text-xs font-medium text-muted-foreground block">Run ID</span>
                <UUIDField 
                  value={run.id} 
                  className="text-sm font-mono"
                  onCopy={() => toast.success("Run ID copied to clipboard")}
                />
              </div>
              
              {/* Job details */}
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
          </div>
        </div>

        {/* Main content - Playwright Report with adjusted height */}
        {run.reportUrl ? (
          <div className="w-full h-[calc(100vh-210px)] overflow-hidden border rounded-md mb-4 relative">
            {isReportLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10">
                <Loader2Icon className="h-12 w-12 animate-spin text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Loading report...</p>
              </div>
            )}
            <iframe
              src={run.reportUrl}
              className={`w-full h-full border-0 ${isReportLoading ? 'opacity-0' : 'opacity-100 transition-opacity duration-300'}`}
              title="Playwright Test Report"
              onLoad={() => setIsReportLoading(false)}
              onError={(e) => {
                console.error("Error loading iframe:", e);
                setIsReportLoading(false);
              }}
            />
          </div>
        ) : (
          <div className="text-center p-8 border rounded-md mb-4">
            <AlertTriangleIcon className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium mb-1">No Report Available</h3>
            <p className="text-muted-foreground">
              There is no Playwright report available for this test run.
            </p>
            {run.logs && (
              <div className="mt-6 rounded-md bg-black text-white p-3 text-sm font-mono h-[calc(100vh-400px)] overflow-auto">
                <pre>{run.logs}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
