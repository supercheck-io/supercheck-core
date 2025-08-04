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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, UserCheck, UserX, Crown, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/tests/data-table-column-header";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  banned?: boolean;
  banReason?: string;
  createdAt: string;
  emailVerified?: boolean;
}

const handleBanUser = async (userId: string, reason: string, onUpdate: () => void) => {
  try {
    const response = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        action: 'ban',
        reason,
      }),
    });

    const data = await response.json();

    if (data.success) {
      toast.success('User banned successfully');
      onUpdate();
    } else {
      toast.error(data.error || 'Failed to ban user');
    }
  } catch (error) {
    console.error('Error banning user:', error);
    toast.error('Failed to ban user');
  }
};

const handleUnbanUser = async (userId: string, onUpdate: () => void) => {
  try {
    const response = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        action: 'unban',
      }),
    });

    const data = await response.json();

    if (data.success) {
      toast.success('User unbanned successfully');
      onUpdate();
    } else {
      toast.error(data.error || 'Failed to unban user');
    }
  } catch (error) {
    console.error('Error unbanning user:', error);
    toast.error('Failed to unban user');
  }
};

const handleImpersonateUser = async (userId: string) => {
  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'impersonate',
      }),
    });

    const data = await response.json();

    if (data.success) {
      toast.success(`Now impersonating ${data.data.impersonatedUser?.name || 'user'}`);
      // Force a full page reload to refresh all session context
      window.location.href = '/';
    } else {
      toast.error(data.error || 'Failed to impersonate user');
    }
  } catch (error) {
    console.error('Error impersonating user:', error);
    toast.error('Failed to impersonate user');
  }
};

const handleChangeRole = async (userId: string, newRole: string, onUpdate: () => void) => {
  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: newRole,
      }),
    });

    const data = await response.json();

    if (data.success) {
      toast.success(`User role updated to ${newRole}`);
      onUpdate();
    } else {
      toast.error(data.error || 'Failed to update user role');
    }
  } catch (error) {
    console.error('Error updating user role:', error);
    toast.error('Failed to update user role');
  }
};

const getRoleIcon = (role: string) => {
  switch (role) {
    case 'super_admin':
      return <Crown className="mr-2 h-4 w-4" />;
    case 'admin':
      return <Shield className="mr-2 h-4 w-4" />;
    default:
      return <User className="mr-2 h-4 w-4" />;
  }
};

const getRoleColor = (role: string) => {
  switch (role) {
    case 'super_admin':
      return 'bg-purple-100 text-purple-800';
    case 'admin':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const createUserColumns = (onUserUpdate: () => void): ColumnDef<AdminUser>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("name")}</div>
    ),
  },
  {
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Email" />
    ),
    cell: ({ row }) => (
      <div className="text-sm">{row.getValue("email")}</div>
    ),
  },
  {
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
    cell: ({ row }) => {
      const role = row.getValue("role") as string || 'user';
      return (
        <Badge variant="outline" className={getRoleColor(role)}>
          {getRoleIcon(role)}
          {role}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id) || 'user');
    },
  },
  {
    accessorKey: "banned",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const banned = row.getValue("banned") as boolean;
      return banned ? (
        <Badge variant="destructive">Banned</Badge>
      ) : (
        <Badge variant="outline">Active</Badge>
      );
    },
    filterFn: (row, id, value) => {
      const banned = row.getValue(id) as boolean;
      const status = banned ? 'banned' : 'active';
      return value.includes(status);
    },
  },
  {
    accessorKey: "emailVerified",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Verified" />
    ),
    cell: ({ row }) => {
      const verified = row.getValue("emailVerified") as boolean;
      return verified ? (
        <Badge variant="outline" className="bg-green-100 text-green-800">Verified</Badge>
      ) : (
        <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Unverified</Badge>
      );
    },
    filterFn: (row, id, value) => {
      const verified = row.getValue(id) as boolean;
      const status = verified ? 'verified' : 'unverified';
      return value.includes(status);
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
      const user = row.original;

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
            <DropdownMenuItem
              onClick={() => handleImpersonateUser(user.id)}
            >
              <UserCheck className="mr-2 h-4 w-4" />
              Impersonate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Shield className="mr-2 h-4 w-4" />
                Change Role
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={() => handleChangeRole(user.id, 'user', onUserUpdate)}
                  disabled={user.role === 'user'}
                >
                  <User className="mr-2 h-4 w-4" />
                  User
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleChangeRole(user.id, 'admin', onUserUpdate)}
                  disabled={user.role === 'admin'}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Admin
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleChangeRole(user.id, 'super_admin', onUserUpdate)}
                  disabled={user.role === 'super_admin'}
                >
                  <Crown className="mr-2 h-4 w-4" />
                  Super Admin
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            {user.banned ? (
              <DropdownMenuItem
                onClick={() => handleUnbanUser(user.id, onUserUpdate)}
              >
                <UserCheck className="mr-2 h-4 w-4" />
                Unban User
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => handleBanUser(user.id, 'Banned by admin', onUserUpdate)}
                className="text-red-600"
              >
                <UserX className="mr-2 h-4 w-4" />
                Ban User
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];