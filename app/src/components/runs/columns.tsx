import type { ColumnDef } from "@tanstack/react-table";
import { CalendarIcon, ClockIcon } from "lucide-react";

import { runStatuses } from "./data";
import type { TestRun } from "./schema";
import { DataTableColumnHeader } from "../jobs/data-table-column-header";
import { formatDistanceToNow } from "date-fns";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";
import { JobStatus } from "./job-status";
import { Badge } from "@/components/ui/badge";

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
      
      // Map the status to a valid status for display
      const mappedStatus = mapDbStatusToDisplayStatus(status);
      
      return (
        <div className="flex items-center">
          <JobStatus jobId={jobId} initialStatus={mappedStatus} />
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
      const duration = row.getValue("duration") as string | number | undefined;
      const status = row.getValue("status") as string;
      
      if (!duration) {
        return (
          <div className="text-muted-foreground">
            {status === "running" ? "Running..." : "-"}
          </div>
        );
      }
      
      // Format the duration when it's a number (milliseconds)
      let formattedDuration = duration;
      if (typeof duration === 'number') {
        // Convert milliseconds to a readable format
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        formattedDuration = minutes > 0 
          ? `${minutes}m ${remainingSeconds}s` 
          : `${remainingSeconds}s`;
      }
      
      return (
        <div className="flex items-center gap-1">
          <ClockIcon className="h-3 w-3 text-muted-foreground" />
          <span>{formattedDuration}</span>
        </div>
      );
    },
  },
];

// Helper to map DB status to a display status that matches runStatuses values
function mapDbStatusToDisplayStatus(dbStatus: string): string {
  // Convert the dbStatus to lowercase for case-insensitive comparison
  const status = typeof dbStatus === 'string' ? dbStatus.toLowerCase() : '';
  
  switch (status) {
    case 'passed':
      return 'completed';
    case 'failed':
    case 'error':
      return 'failed';
    case 'running':
    case 'pending':
    case 'skipped':
      return status;
    case 'completed':
      return 'completed';
    default:
      console.warn(`Unknown status: ${dbStatus}`);
      return 'pending';
  }
}
