"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, UserMinus, Crown, Shield, User, Eye } from "lucide-react";
import { toast } from "sonner";
import { DataTableColumnHeader } from "@/components/tests/data-table-column-header";

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
  type: 'member';
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'expired';
  expiresAt: string;
  inviterName: string;
  inviterEmail: string;
  type: 'invitation';
}

export type MemberOrInvitation = OrgMember | PendingInvitation;

const handleUpdateMemberRole = async (memberId: string, newRole: string, onUpdate: () => void) => {
  try {
    const response = await fetch(`/api/organizations/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: newRole }),
    });

    const data = await response.json();

    if (data.success) {
      toast.success('Member role updated successfully');
      onUpdate();
    } else {
      toast.error(data.error || 'Failed to update member role');
    }
  } catch (error) {
    console.error('Error updating member role:', error);
    toast.error('Failed to update member role');
  }
};

const handleRemoveMember = async (memberId: string, memberName: string, onUpdate: () => void) => {
  if (!confirm(`Are you sure you want to remove ${memberName} from the organization?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/organizations/members/${memberId}`, {
      method: 'DELETE',
    });

    const data = await response.json();

    if (data.success) {
      toast.success('Member removed successfully');
      onUpdate();
    } else {
      toast.error(data.error || 'Failed to remove member');
    }
  } catch (error) {
    console.error('Error removing member:', error);
    toast.error('Failed to remove member');
  }
};

const getRoleIcon = (role: string) => {
  switch (role) {
    case 'owner':
      return <Crown className="mr-2 h-4 w-4" />;
    case 'admin':
      return <Shield className="mr-2 h-4 w-4" />;
    case 'member':
      return <User className="mr-2 h-4 w-4" />;
    case 'viewer':
      return <Eye className="mr-2 h-4 w-4" />;
    default:
      return <User className="mr-2 h-4 w-4" />;
  }
};

const getRoleColor = (role: string, isInvitation = false) => {
  if (isInvitation) return 'bg-orange-100 text-orange-700';
  
  switch (role) {
    case 'owner':
      return 'bg-purple-100 text-purple-700';
    case 'admin':
      return 'bg-blue-100 text-blue-700';
    case 'member':
      return 'bg-green-100 text-green-700';
    case 'viewer':
      return 'bg-gray-100 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-700';
    case 'accepted':
      return 'bg-green-100 text-green-700';
    case 'expired':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

export const createMemberColumns = (onMemberUpdate: () => void): ColumnDef<MemberOrInvitation>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Member" />
    ),
    cell: ({ row }) => {
      const item = row.original;
      const isInvitation = item.type === 'invitation';
      
      return (
        <div className="py-2">
          <div className="font-medium text-sm">
            {isInvitation ? (item as PendingInvitation).email : (item as OrgMember).name}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {isInvitation 
              ? `Invited by ${(item as PendingInvitation).inviterName}`
              : (item as OrgMember).email
            }
          </div>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      const item = row.original;
      const searchText = item.type === 'invitation' 
        ? (item as PendingInvitation).email
        : `${(item as OrgMember).name} ${(item as OrgMember).email}`;
      return searchText.toLowerCase().includes(value.toLowerCase());
    },
  },
  {
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
    cell: ({ row }) => {
      const item = row.original;
      const isInvitation = item.type === 'invitation';
      const role = isInvitation ? (item as PendingInvitation).role : (item as OrgMember).role;
      
      return (
        <div className="py-2">
          <Badge 
            variant="outline" 
            className={`${getRoleColor(role, isInvitation)} text-xs px-2 py-1`}
          >
            {getRoleIcon(role)}
            {role}
          </Badge>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      const item = row.original;
      const role = item.type === 'invitation' ? (item as PendingInvitation).role : (item as OrgMember).role;
      return value.includes(role);
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const item = row.original;
      const isInvitation = item.type === 'invitation';
      
      return (
        <div className="py-2">
          {isInvitation ? (
            <Badge variant="outline" className={`${getStatusColor((item as PendingInvitation).status)} text-xs px-2 py-1`}>
              {(item as PendingInvitation).status}
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-green-100 text-green-700 text-xs px-2 py-1">
              Active
            </Badge>
          )}
        </div>
      );
    },
    filterFn: (row, id, value) => {
      const item = row.original;
      const status = item.type === 'invitation' ? (item as PendingInvitation).status : 'active';
      return value.includes(status);
    },
  },
  {
    accessorKey: "joinedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => {
      const item = row.original;
      const isInvitation = item.type === 'invitation';
      
      return (
        <div className="py-2">
          {isInvitation ? (
            <div className="text-xs space-y-1">
              <div className="text-muted-foreground">Expires:</div>
              <div className="font-medium">
                {new Date((item as PendingInvitation).expiresAt).toLocaleDateString()}
              </div>
            </div>
          ) : (
            <div className="text-xs space-y-1">
              <div className="text-muted-foreground">Joined:</div>
              <div className="font-medium">
                {new Date((item as OrgMember).joinedAt).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const item = row.original;
      const isInvitation = item.type === 'invitation';

      if (isInvitation) {
        return (
          <div className="py-2">
            <div className="text-xs text-muted-foreground">
              Pending invitation
            </div>
          </div>
        );
      }

      const member = item as OrgMember;

      if (member.role === 'owner') {
        return (
          <div className="py-2">
            <Badge variant="outline" className="bg-purple-50 text-purple-700 text-xs px-2 py-1">
              Organization Owner
            </Badge>
          </div>
        );
      }

      return (
        <div className="flex items-center gap-2 py-2">
          <Select
            value={member.role}
            onValueChange={(value) => handleUpdateMemberRole(member.id, value, onMemberUpdate)}
          >
            <SelectTrigger className="w-28 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleRemoveMember(member.id, member.name, onMemberUpdate)}
                className="text-red-600"
              >
                <UserMinus className="mr-2 h-4 w-4" />
                Remove Member
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];