"use client";

import React, { useState, useEffect } from "react";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { TestRun } from "./schema";
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
    <div className="h-full flex-1 flex-col space-y-4 p-4 md:flex">
      <DataTable columns={columns} data={runs} onRowClick={handleRowClick} />
    </div>
  );
}
