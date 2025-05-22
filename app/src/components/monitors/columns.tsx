import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import type { Monitor } from "./schema";
import { CalendarIcon, ClockIcon } from "lucide-react";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";
import { formatDistanceToNow } from "@/lib/date-utils";
import { MonitorStatusIndicator } from "./monitor-status-indicator";

// Type definition for the extended meta object used in this table
interface MonitorTableMeta {
  onDeleteMonitor?: (id: string) => void;
  globalFilterColumns?: string[];
  // Include other potential properties from the base TableMeta if needed
}

import { monitorTypes, monitorStatuses } from "./data";

export const columns: ColumnDef<Monitor>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader className="ml-2" column={column} title="ID" />
    ),
    cell: ({ row }) => (
      <div className="w-[120px] ml-2">
        <UUIDField 
          value={row.getValue("id")} 
          maxLength={24} 
          onCopy={() => toast.success("Monitor ID copied to clipboard")}
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[200px] truncate">
            {row.getValue("name")}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "url",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="URL" />
    ),
    cell: ({ row }) => {
      return (
        <div className="max-w-[200px] truncate text-muted-foreground">
          {row.getValue("url")}
        </div>
      );
    },
  },
  {
    accessorKey: "method",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = monitorTypes.find((type) => type.value === row.getValue("method"));

      if (!type) {
        return null;
      }

      return (
        <div className="flex items-center w-[120px]">
          {type.icon && <type.icon className={`mr-2 h-4 w-4 ${type.color}`} />}
          <span>{type.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = monitorStatuses.find(
        (status) => status.value === row.getValue("status")
      );

      if (!status) {
        return null;
      }

      return (
        <div className="flex items-center w-[100px]">
          <status.icon className={`mr-2 h-4 w-4 ${status.color}`} />
          <span>{status.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "statusChart",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Health" />
    ),
    cell: ({ row }) => {
      const monitorId = row.getValue("id") as string;
      const monitorStatus = row.getValue("status") as string;
      const uptime = typeof row.original.uptime === 'number' 
        ? row.original.uptime 
        : parseFloat(row.original.uptime || '95');

      return (
        <div className="w-[120px]">
          <MonitorStatusIndicator 
            monitorId={monitorId}
            status={monitorStatus}
            uptime={uptime}
          />
        </div>
      );
    },
  },
  {
    accessorKey: "interval",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Interval" />
    ),
    cell: ({ row }) => {
      const interval = row.getValue("interval") as number;
      
      // Format interval to be readable (i.e. 60 -> 1 min, 300 -> 5 min)
      const formatted = interval < 60 
        ? `${interval}s` 
        : `${Math.floor(interval / 60)}m`;

      return (
        <div className="flex items-center w-[80px]">
          <ClockIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>{formatted}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      const createdAt = row.getValue("createdAt") as string;
      if (!createdAt) return null;

      // Format date without using date-fns
      const date = new Date(createdAt);
      const formattedDate = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return (
        <div className="flex items-center w-[120px]">
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>{formattedDate}</span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      // Explicitly cast table.options.meta to the extended type
      const meta = table.options.meta as MonitorTableMeta | undefined;
      const onDeleteCallback = meta?.onDeleteMonitor;

      return (
        <DataTableRowActions
          row={row}
          onDelete={
            onDeleteCallback
              ? () => onDeleteCallback(row.original.id)
              : undefined
          }
        />
      );
    },
  },
]; 