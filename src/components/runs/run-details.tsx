"use client";

import React from "react";
import { RunResponse } from "@/actions/get-runs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runStatuses } from "./data/data";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

interface RunDetailsProps {
  run: RunResponse;
}

export function RunDetails({ run }: RunDetailsProps) {
  const router = useRouter();
  
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
    <div className="container mx-auto py-4 px-2">
      <div className="flex flex-col space-y-4">
        {/* Breadcrumbs */}
        <PageBreadcrumbs items={breadcrumbs} />

        {/* Header with navigation and basic info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/runs")}
              className="mr-4"
            >
              <ArrowLeftIcon className="mr-2 h-4 w-4" />
              Back to Runs
            </Button>
            <h1 className="text-xl font-bold">{run.id}</h1>
            <div className="ml-4">{getStatusBadge(run.status)}</div>
          </div>
          
          <div className="flex items-center">
            <div className="mr-6">
              <div className="text-sm font-medium">{run.jobName || "Unknown Job"}</div>
              <div className="text-xs text-muted-foreground">{run.jobId}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/jobs/${run.jobId}`)}
            >
              <ExternalLinkIcon className="mr-2 h-4 w-4" />
              View Job
            </Button>
          </div>
        </div>

        {/* Main content - Playwright Report */}
        {run.reportUrl ? (
          <div className="w-full h-[calc(100vh-180px)] overflow-hidden border rounded-md mb-6">
            <iframe
              src={run.reportUrl}
              className="w-full h-full border-0"
              title="Playwright Test Report"
            />
          </div>
        ) : (
          <div className="text-center p-12 border rounded-md mb-6">
            <AlertTriangleIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Report Available</h3>
            <p className="text-muted-foreground">
              There is no Playwright report available for this test run.
            </p>
            {run.logs && (
              <div className="mt-8 rounded-md bg-black text-white p-4 text-sm font-mono h-96 overflow-auto">
                <pre>{run.logs}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
