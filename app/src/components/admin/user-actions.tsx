"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { ImpersonateDialog } from './impersonate-dialog';
import { AdminUser } from './user-columns';

interface UserActionsProps {
  user: AdminUser;
  onUserUpdate: () => void;
}

const handleBanUser = async (userId: string, onUpdate: () => void) => {
  const reason = prompt('Enter ban reason:');
  if (!reason) return;

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

export function UserActions({ user, onUserUpdate }: UserActionsProps) {
  const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false);

  return (
    <>
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
            onClick={() => setImpersonateDialogOpen(true)}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            Impersonate
          </DropdownMenuItem>
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
              onClick={() => handleBanUser(user.id, onUserUpdate)}
              className="text-destructive"
            >
              <UserX className="mr-2 h-4 w-4" />
              Ban User
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ImpersonateDialog
        open={impersonateDialogOpen}
        onOpenChange={setImpersonateDialogOpen}
        userId={user.id}
        userName={user.name}
        userEmail={user.email}
      />
    </>
  );
}