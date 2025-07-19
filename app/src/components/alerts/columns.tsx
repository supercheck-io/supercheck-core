"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import { AlertHistory } from "./schema";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getNotificationProviderConfig } from "./data";
import { Clock } from "lucide-react";

const statusColors = {
  sent: "bg-green-100 text-green-800 hover:bg-green-200",
  failed: "bg-red-100 text-red-800 hover:bg-red-200",
  pending: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
} as const;

const typeColors = {
  job_failed: "bg-red-100 text-red-800 hover:bg-red-200",
  job_success: "bg-green-100 text-green-800 hover:bg-green-200",
  job_timeout: "bg-orange-100 text-orange-800 hover:bg-orange-200",
  monitor_failure: "bg-red-100 text-red-800 hover:bg-red-200",
  monitor_recovery: "bg-green-100 text-green-800 hover:bg-green-200",
  ssl_expiring: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
} as const;

export const columns: ColumnDef<AlertHistory>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader className="ml-2" column={column} title="Alert ID" />
    ),
    cell: ({ row }) => {
      const id = row.getValue("id") as string;
      return (
        <div className="w-[90px] ml-2">
          <UUIDField 
            value={id} 
            maxLength={24} 
            onCopy={() => toast.success("Alert ID copied to clipboard")}
          />
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "targetName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      const targetName = row.getValue("targetName") as string;
      return (
        <div className="font-medium max-w-[200px] truncate">{targetName}</div>
      );
    },
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = row.getValue("type") as string;
      const colorClass = typeColors[type as keyof typeof typeColors] || "bg-gray-100 text-gray-800 hover:bg-gray-200";
      return (
        <Badge className={`capitalize ${colorClass}`}>
          {type.replace(/_/g, " ")}
        </Badge>
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
      const status = row.getValue("status") as keyof typeof statusColors;
      return (
        <Badge className={`capitalize ${statusColors[status]}`}>
          {status}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "notificationProvider",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Provider" />
    ),
    cell: ({ row }) => {
      const provider = row.getValue("notificationProvider") as string;
      const [isOpen, setIsOpen] = useState(false);
      
      // Parse providers from comma-separated string
      const providers = provider
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      if (!providers || providers.length === 0) {
        return (
          <div className="text-muted-foreground text-sm">
            No providers
          </div>
        );
      }

      const displayProviders = providers.slice(0, 2);
      const remainingCount = providers.length - 2;

      // Only show popover if there are more than 2 providers
      if (providers.length <= 2) {
        return (
          <div className="flex items-center gap-1 min-h-[24px]">
            {providers.map((providerType, index) => {
              const config = getNotificationProviderConfig(providerType);
              const IconComponent = config.icon;
              return (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-xs whitespace-nowrap flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-card"
                >
                  <IconComponent className={`h-3 w-3 mr-0.5 ${config.color}`} />
                  {config.label}
                </Badge>
              );
            })}
          </div>
        );
      }

      return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <div
              className="flex items-center gap-1 min-h-[24px] cursor-pointer"
              onMouseEnter={() => setIsOpen(true)}
              onMouseLeave={() => setIsOpen(false)}
            >
              {displayProviders.map((providerType, index) => {
                const config = getNotificationProviderConfig(providerType);
                const IconComponent = config.icon;
                return (
                  <Badge
                    key={index}
                    variant="outline"
                    className="text-xs whitespace-nowrap flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-card"
                  >
                    <IconComponent className={`h-3 w-3 mr-0.5 ${config.color}`} />
                    {config.label}
                  </Badge>
                );
              })}
              {remainingCount > 0 && (
                <Badge variant="outline" className="text-xs whitespace-nowrap flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-card">
                  +{remainingCount}
                </Badge>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent className="flex justify-center items-center w-auto max-w-[500px]">
            <div className="flex justify-center flex-wrap gap-1">
              {providers.map((providerType, index) => {
                const config = getNotificationProviderConfig(providerType);
                const IconComponent = config.icon;
                return (
                  <Badge
                    key={index}
                    variant="outline"
                    className="text-xs flex items-center gap-1 bg-background border-border"
                  >
                    <IconComponent className={`h-3 w-3 ${config.color}`} />
                    {config.label}
                  </Badge>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      );
    },
    filterFn: (row, id, value: string[]) => {
      const providerString = row.getValue(id) as string;
      if (!providerString || value.length === 0) return true;
      
      const providers = providerString
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
      
      return value.some(filterProvider => 
        providers.some(provider => 
          provider.toLowerCase() === filterProvider.toLowerCase()
        )
      );
    },
  },
  {
    accessorKey: "timestamp",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Sent At" />
    ),
    cell: ({ row }) => {
      const timestamp = row.getValue("timestamp") as string;
      if (!timestamp) {
        return <div className="text-muted-foreground">Never</div>;
      }
      return (
        <div className="flex flex-col">
          <div className="flex items-center">
            <Clock className="mr-2 h-4 w-4 text-muted-foreground self-center" />
            <div className="flex items-center">
              <span>
                {new Date(timestamp).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <span className="text-muted-foreground ml-1 text-xs">
              {new Date(timestamp).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <DataTableRowActions row={row} />,
  },
];

export type { AlertHistory };
