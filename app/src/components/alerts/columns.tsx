"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import { AlertHistory } from "./schema";
import { UUIDField } from "@/components/ui/uuid-field";
import { toast } from "sonner";

const severityColors = {
  info: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  warning: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
  error: "bg-red-100 text-red-800 hover:bg-red-200",
  success: "bg-green-100 text-green-800 hover:bg-green-200",
} as const;

const statusColors = {
  sent: "bg-green-100 text-green-800 hover:bg-green-200",
  failed: "bg-red-100 text-red-800 hover:bg-red-200",
  pending: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
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
        <div className="w-[120px] ml-2">
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
    accessorKey: "targetType",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Target" />
    ),
    cell: ({ row }) => {
      const targetType = row.getValue("targetType") as string;
      const targetName = row.original.targetName;
      return (
        <div>
          <div className="font-medium">{targetName}</div>
          <div className="text-sm text-muted-foreground capitalize">{targetType}</div>
        </div>
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
      return (
        <Badge variant="outline" className="capitalize">
          {type.replace(/_/g, " ")}
        </Badge>
      );
    },
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    cell: ({ row }) => {
      const title = row.getValue("title") as string;
      return <div className="font-medium max-w-[200px] truncate">{title}</div>;
    },
  },
  {
    accessorKey: "severity",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Severity" />
    ),
    cell: ({ row }) => {
      const severity = row.getValue("severity") as keyof typeof severityColors;
      return (
        <Badge className={`capitalize ${severityColors[severity]}`}>
          {severity}
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
      return <div className="capitalize">{provider}</div>;
    },
  },
  {
    accessorKey: "timestamp",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Sent At" />
    ),
    cell: ({ row }) => {
      const timestamp = row.getValue("timestamp") as string;
      return (
        <div className="text-sm">
          {new Date(timestamp).toLocaleString()}
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
