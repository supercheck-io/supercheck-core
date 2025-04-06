"use client";

import React, { useState, useEffect } from "react";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { getRuns } from "@/actions/get-runs";
import { TestRun } from "./data/schema";
import { toast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { Row } from "@tanstack/react-table";

export function RunsClient() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchRuns() {
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
        toast({
          title: "Error fetching runs",
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchRuns();
  }, []);

  const handleRowClick = (row: Row<TestRun>) => {
    const runId = row.original.id;
    router.push(`/runs/${runId}`);
  };

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
        <DataTable
          columns={columns}
          data={runs}
          isLoading={isLoading}
          onRowClick={handleRowClick}
        />
    </div>
  );
} 