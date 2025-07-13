import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import type { Monitor } from "./schema";
import { CalendarIcon, ClockIcon } from "lucide-react";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";

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
      <DataTableColumnHeader className="ml-2" column={column} title="Monitor ID" />
    ),
    cell: ({ row }) => {
      const id = row.getValue("id") as string;
      const [isOpen, setIsOpen] = useState(false);
      
      return (
        <div className="w-[90px]">
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <div 
                className="cursor-pointer"
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
              >
                <UUIDField 
                  value={id} 
                  maxLength={24} 
                  onCopy={() => toast.success("Monitor ID copied to clipboard")}
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="flex justify-center items-center">
              <p className="text-xs text-muted-foreground break-all">
                {id}
              </p>
            </PopoverContent>
          </Popover>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      const name = row.getValue("name") as string;
      const [isOpen, setIsOpen] = useState(false);
      
      // Check if text is likely to be truncated (rough estimate)
      const isTruncated = name.length > 20; // Approximate character limit for 200px width
      
      if (!isTruncated) {
        return (
          <div className="flex space-x-2">
            <span className="max-w-[160px] truncate">
              {name}
            </span>
          </div>
        );
      }
      
      return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <div 
              className="flex space-x-2 cursor-pointer"
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
            >
              <span className="max-w-[160px] truncate">
                {name}
              </span>
            </div>
          </PopoverTrigger>
          <PopoverContent className="flex justify-center items-center w-auto max-w-[500px]">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {name}
              </p>
            </div>
          </PopoverContent>
        </Popover>
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
      const [isOpen, setIsOpen] = useState(false);
      
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
        
        // Check if URL is likely to be truncated
        const isTruncated = displayUrl.length > 20;
        
        if (!isTruncated) {
          return (
            <span className="w-[170px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm block">
              {displayUrl}
            </span>
          );
        }
        
        return (
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <span 
                className="w-[170px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm block cursor-pointer"
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
              >
                {displayUrl}
              </span>
            </PopoverTrigger>
            <PopoverContent className="flex justify-center items-center w-auto max-w-[800px]">
              <p className="text-xs text-muted-foreground font-mono">
                {displayUrl}
              </p>
            </PopoverContent>
          </Popover>
        );
      }
      
      const displayValue = target || legacyUrl || "—";
      const isTruncated = displayValue.length > 20;
      
      if (!isTruncated) {
        return (
          <span className="w-[170px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm block">
            {displayValue}
          </span>
        );
      }
      
      return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <span 
              className="w-[170px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm block cursor-pointer"
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
            >
              {displayValue}
            </span>
          </PopoverTrigger>
          <PopoverContent className="flex justify-center items-center w-auto max-w-[800px]">
            <p className="text-xs text-muted-foreground font-mono">
              {displayValue}
            </p>
          </PopoverContent>
        </Popover>
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