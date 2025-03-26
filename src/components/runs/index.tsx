"use client";

import React, { useState, useEffect } from "react";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { TestRun } from "./data/schema";
import { getRuns } from "@/actions/get-runs";
import { useRouter } from "next/navigation";
import { Row } from "@tanstack/react-table";

export function Runs() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const router = useRouter();

  const fetchRuns = async () => {
    try {
      const data = await getRuns();
      // Cast the data to TestRun[] to ensure type compatibility
      setRuns(data as unknown as TestRun[]);
    } catch (error) {
      console.error("Failed to fetch runs:", error);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleRowClick = (row: Row<TestRun>) => {
    const run = row.original;
    router.push(`/runs/${run.id}`);
  };

  return (
    <div className="h-full flex-1 flex-col space-y-8 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Test Runs</h2>
          <p className="text-muted-foreground">
            View and manage all test run executions
          </p>
        </div>
      </div>

      <DataTable columns={columns} data={runs} onRowClick={handleRowClick} />
    </div>
  );
}
