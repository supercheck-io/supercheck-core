"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Eye, Trash2, Building } from "lucide-react";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/tests/data-table-column-header";

export interface AdminOrganization {
  id: string;
  name: string;
  slug?: string;
  memberCount?: number;
  projectCount?: number;
  createdAt: string;
}

const handleViewOrg = (orgId: string) => {
  // Navigate to organization details
  window.open(`/admin/organizations/${orgId}`, '_blank');
};

const handleDeleteOrg = async (orgId: string, orgName: string, onUpdate: () => void) => {
  if (!confirm(`Are you sure you want to delete "${orgName}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/admin/organizations/${orgId}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (data.success) {
      toast.success('Organization deleted successfully');
      onUpdate();
    } else {
      toast.error(data.error || 'Failed to delete organization');
    }
  } catch (error) {
    console.error('Error deleting organization:', error);
    toast.error('Failed to delete organization');
  }
};

export const createOrgColumns = (onOrgUpdate: () => void): ColumnDef<AdminOrganization>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div className="font-medium flex items-center">
        <Building className="mr-2 h-4 w-4 text-muted-foreground" />
        {row.getValue("name")}
      </div>
    ),
  },
  {
    accessorKey: "slug",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Slug" />
    ),
    cell: ({ row }) => {
      const slug = row.getValue("slug") as string;
      return slug ? (
        <Badge variant="outline">{slug}</Badge>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      );
    },
  },
  {
    accessorKey: "memberCount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Members" />
    ),
    cell: ({ row }) => {
      const count = row.getValue("memberCount") as number;
      return count !== undefined ? (
        <Badge variant="secondary">{count}</Badge>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      );
    },
  },
  {
    accessorKey: "projectCount",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Projects" />
    ),
    cell: ({ row }) => {
      const count = row.getValue("projectCount") as number;
      return count !== undefined ? (
        <Badge variant="secondary">{count}</Badge>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      const date = new Date(row.getValue("createdAt"));
      return (
        <div className="text-sm">
          {date.toLocaleDateString()}
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const org = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleViewOrg(org.id)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleDeleteOrg(org.id, org.name, onOrgUpdate)}
              className="text-red-600"
              disabled={(org.memberCount || 0) > 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];