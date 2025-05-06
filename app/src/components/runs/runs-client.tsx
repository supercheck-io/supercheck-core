"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createColumns } from "./columns";
import { DataTable } from "./data-table";
import { getRuns } from "@/actions/get-runs";
import { TestRun } from "./schema";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Row } from "@tanstack/react-table";

export function RunsClient() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tableKey, setTableKey] = useState(Date.now()); // For forcing re-render
  const router = useRouter();

  // Created a reusable fetchRuns function with useCallback
  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const fetchedRuns = await getRuns();
      // Cast status and map nulls to undefined
      const typedRuns = fetchedRuns.map(run => ({
        ...run,
        status: run.status as TestRun['status'],
        jobName: run.jobName ?? undefined,
        duration: run.duration ?? undefined,
        startedAt: run.startedAt ?? undefined,
        completedAt: run.completedAt ?? undefined,
        reportUrl: run.reportUrl ?? undefined,
        logs: run.logs ?? undefined,
        errorDetails: run.errorDetails ?? undefined,
      }));
      setRuns(typedRuns);
    } catch (error) {
      console.error("Error fetching runs:", error);
      setRuns([]);
      toast.error("Error fetching runs", {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchRuns();
  }, [fetchRuns]);

  const handleRowClick = (row: Row<TestRun>) => {
    const runId = row.original.id;
    router.push(`/runs/${runId}`);
  };

  // Handler for when a run is deleted - refresh data without page reload
  const handleDeleteRun = useCallback(() => {
    // Update the table key to force a remount
    setTableKey(Date.now());
    // Fetch fresh data
    fetchRuns();
    // Revalidate the page as well
    router.refresh();
  }, [fetchRuns, router]);

  // Create columns with the delete handler
  const columns = createColumns(handleDeleteRun);

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <DataTable
        key={tableKey}
        columns={columns}
        data={runs}
        isLoading={isLoading}
        onRowClick={handleRowClick}
      />
    </div>
  );
} 