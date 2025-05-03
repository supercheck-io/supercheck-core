"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createColumns } from "./columns";
import { DataTable } from "./data-table";
import { TestRun } from "./schema";
import { getRuns } from "@/actions/get-runs";
import { useRouter } from "next/navigation";
import { Row } from "@tanstack/react-table";
import { toast } from "sonner";

export function Runs() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [tableKey, setTableKey] = useState(Date.now()); // Add key to force remounting

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getRuns();
      // Cast the data to TestRun[] to ensure type compatibility
      setRuns(data as unknown as TestRun[]);
    } catch (error) {
      console.error("Failed to fetch runs:", error);
      toast.error("Failed to fetch runs");
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    setTableKey(Date.now());
    // Refresh data after deletion
    fetchRuns();
  };

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
