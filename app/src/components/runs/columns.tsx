import type { ColumnDef } from "@tanstack/react-table";
import { CalendarIcon, ClockIcon } from "lucide-react";

import { runStatuses } from "./data";
import type { TestRun } from "./schema";
import { DataTableColumnHeader } from "../jobs/data-table-column-header";
import { formatDistanceToNow } from "date-fns";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";
import { JobStatus } from "./job-status";

export const columns: ColumnDef<TestRun>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Run ID" />
    ),
    cell: ({ row }) => (
      <div className="w-[120px] ml-2">
        <UUIDField 
          value={row.getValue("id")} 
          maxLength={24} 
          onCopy={() => toast.success("Run ID copied to clipboard")}
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "jobId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Job ID" />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <UUIDField
            value={row.getValue("jobId")}
            maxLength={24}
            className="w-[120px]"
            onCopy={() => toast.success("Job ID copied to clipboard")}
          />
        </div>
      );
    },
  },
  {
    accessorKey: "jobName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Job Name" />
    ),
    cell: ({ row }) => {
      const jobName = row.getValue("jobName") as string | undefined;
      return (
        <div className="max-w-[200px] truncate">{jobName || "Unknown Job"}</div>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const jobId = row.getValue("jobId") as string;
      
      return (
        <div className="flex items-center">
          <JobStatus jobId={jobId} initialStatus={status} />
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "startedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Started" />
    ),
    cell: ({ row }) => {
      const startedAt = row.getValue("startedAt") as string | undefined;
      if (!startedAt) {
        return <div className="text-muted-foreground">-</div>;
      }
      return (
        <div className="flex items-center gap-1">
          <CalendarIcon className="h-3 w-3 text-muted-foreground" />
          <span title={new Date(startedAt).toLocaleString()}>
            {formatDistanceToNow(new Date(startedAt), { addSuffix: true })}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "duration",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Duration" />
    ),
    cell: ({ row }) => {
      const duration = row.getValue("duration") as number | undefined;
      if (!duration) {
        const status = row.getValue("status") as string;
        return (
          <div className="text-muted-foreground">
            {status === "running" ? "Running..." : "-"}
          </div>
        );
      }
      return (
        <div className="flex items-center gap-1">
          <ClockIcon className="h-3 w-3 text-muted-foreground" />
          <span>{formatDuration(duration)}</span>
        </div>
      );
    },
  },
];

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
}
