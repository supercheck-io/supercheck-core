import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import type { Monitor } from "./schema";
import { CalendarIcon, ClockIcon } from "lucide-react";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";

import { MonitorStatusIndicator } from "./monitor-status-indicator";
import { monitorTypes } from "./data";

// Type definition for the extended meta object used in this table
interface MonitorTableMeta {
  onDeleteMonitor?: (id: string) => void;
  globalFilterColumns?: string[];
  // Include other potential properties from the base TableMeta if needed
}

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
    accessorKey: "target",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Target" />
    ),
    cell: ({ row }) => {
      const target = row.getValue("target") as string;
      const monitorType = row.original.type as string;
      const legacyUrl = row.original.url as string; // Fallback for legacy data
      
      // For heartbeat monitors, show truncated URL without hyperlink styling
      if (monitorType === "heartbeat") {
        const config = row.original.config as Record<string, unknown>;
        const heartbeatUrl = config?.heartbeatUrl as string;
        
        let displayUrl = "";
        if (heartbeatUrl) {
          displayUrl = heartbeatUrl;
        } else {
          // Fallback: construct URL from target token
          const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
          displayUrl = `${baseUrl}/api/heartbeat/${target}`;
        }
        
        // Truncate URL to keep it professional and not break UI
        const truncatedUrl = displayUrl.length > 40 
          ? `${displayUrl.substring(0, 37)}...` 
          : displayUrl;
        
        return (
          <span className="max-w-[200px] truncate font-mono text-sm text-muted-foreground">
            {truncatedUrl}
          </span>
        );
      }
      
      const displayValue = target || legacyUrl || "—";
      
      return (
        <span className="max-w-[200px] truncate font-mono text-sm">{displayValue}</span>
      );
    },
  },
  {
    accessorKey: "type",
    id: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = monitorTypes.find((type) => type.value === row.getValue("type"));

      if (!type) {
        return null;
      }

      return (
        <div className="flex items-center w-[150px]">
          {type.icon && <type.icon className={`mr-2 h-5 w-5 ${type.color}`} />}
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
      const statusValue = row.getValue("status") as "up" | "down" | "paused" | "pending" | "maintenance";
      return <MonitorStatusIndicator status={statusValue} monitorId={row.original.id} />;
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "frequencyMinutes",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Interval" />
    ),
    cell: ({ row }) => {
      const frequencyMinutes = row.getValue("frequencyMinutes") as number;
      
      // Format interval to be readable (i.e. 1 -> 1m, 60 -> 1h)
      const formatted = frequencyMinutes < 60 
        ? `${frequencyMinutes}m` 
        : `${Math.floor(frequencyMinutes / 60)}h`;

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