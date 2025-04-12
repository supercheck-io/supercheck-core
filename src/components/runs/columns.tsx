import type { ColumnDef } from "@tanstack/react-table";
import { CalendarIcon, ClockIcon } from "lucide-react";

import { runStatuses } from "./data";
import type { TestRun } from "./schema";
import { DataTableColumnHeader } from "../jobs/data-table-column-header";
import { formatDistanceToNow } from "date-fns";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";

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
      const status = runStatuses.find(
        (status) => status.value === row.getValue("status")
      );

      if (!status) {
        return null;
      }

      return (
        <div className="flex w-[120px] items-center">
          {status.icon && (
            <status.icon className={`mr-2 h-4 w-4 ${status.color}`} />
          )}
          <span>{status.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "duration",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Duration" />
    ),
    cell: ({ row }) => {
      const duration = row.getValue("duration") as string | null;
      return (
        <div className="flex items-center w-[100px]">
          <ClockIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>{duration || "N/A"}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "startedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Started" />
    ),
    cell: ({ row }) => {
      const startedAt = row.getValue("startedAt") as string | null;
      if (!startedAt) return <div>N/A</div>;

      const date = new Date(startedAt);
      return (
        <div className="flex items-center w-[150px]">
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span title={date.toLocaleString()}>
            {formatDistanceToNow(date, { addSuffix: true })}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "completedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Completed" />
    ),
    cell: ({ row }) => {
      const completedAt = row.getValue("completedAt") as string | null;
      if (!completedAt) return <div>N/A</div>;

      const date = new Date(completedAt);
      return (
        <div className="flex items-center w-[150px]">
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span title={date.toLocaleString()}>
            {formatDistanceToNow(date, { addSuffix: true })}
          </span>
        </div>
      );
    },
  },
];
