"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createColumns } from "./columns";
import { DataTable } from "./data-table";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { TestRun } from "./schema";
import { useRouter } from "next/navigation";
import { Row } from "@tanstack/react-table";
import { toast } from "sonner";
import { useProjectContext } from "@/hooks/use-project-context";

export function Runs() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [tableKey, setTableKey] = useState(Date.now()); // Add key to force remounting
  const [mounted, setMounted] = useState(false);
  const { projectId, currentProject } = useProjectContext();

  // Set mounted to true after initial render
  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
    };
  }, []);

  // Safe state setters that only run when component is mounted
  const safeSetRuns = useCallback((runs: TestRun[] | ((prev: TestRun[]) => TestRun[])) => {
    if (mounted) {
      setRuns(runs);
    }
  }, [mounted]);

  const safeSetIsLoading = useCallback((loading: boolean) => {
    if (mounted) {
      setIsLoading(loading);
    }
  }, [mounted]);

  const safeSetTableKey = useCallback((key: number) => {
    if (mounted) {
      setTableKey(key);
    }
  }, [mounted]);

  const fetchRuns = useCallback(async () => {
    safeSetIsLoading(true);
    try {
      // Only fetch runs if we have a projectId and organizationId
      if (!projectId || !currentProject?.organizationId) {
        safeSetRuns([]);
        safeSetIsLoading(false);
        return;
      }

      const response = await fetch(`/api/runs?projectId=${projectId}&organizationId=${currentProject.organizationId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch runs');
      }
      
      // Cast the data to TestRun[] to ensure type compatibility and handle trigger field
      const typedRuns = data.map((run: { trigger?: string; [key: string]: unknown }) => ({
        ...run,
        trigger: run.trigger ?? undefined,
      }));
      safeSetRuns(typedRuns as TestRun[]);
    } catch (error) {
      console.error("Failed to fetch runs:", error);
      toast.error("Failed to fetch runs");
      safeSetRuns([]);
    } finally {
      safeSetIsLoading(false);
    }
  }, [safeSetRuns, safeSetIsLoading, projectId, currentProject?.organizationId]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const handleRowClick = (row: Row<TestRun>) => {
    const run = row.original;
    router.push(`/runs/${run.id}`);
  };

  // Simple handler to refresh data after deletion
  const handleDeleteRun = () => {
    // Generate a new table key to force remounting
    safeSetTableKey(Date.now());
    // Refresh data after deletion
    fetchRuns();
  };

  // Don't render until component is mounted
  if (!mounted) {
    return (
      <div className="h-full flex-1 flex-col space-y-4 p-4 md:flex">
        <DataTableSkeleton columns={6} rows={8} />
      </div>
    );
  }

  // Create columns with the delete handler
  const columns = createColumns(handleDeleteRun);

  return (
    <div className="h-full flex-1 flex-col space-y-4 p-4 md:flex">
      <DataTable 
        key={tableKey}
        columns={columns} 
        data={runs} 
        onRowClick={handleRowClick} 
        isLoading={isLoading}
      />
    </div>
  );
}
