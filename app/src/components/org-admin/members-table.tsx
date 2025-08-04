"use client";

import * as React from "react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { MemberTableToolbar } from "./member-table-toolbar";
import { createMemberColumns, type MemberOrInvitation } from "./member-columns";

interface MembersTableProps {
  members: MemberOrInvitation[];
  onMemberUpdate: () => void;
  onInviteMember: () => void;
  isLoading?: boolean;
}

// Custom global filter function for members table
function memberGlobalFilterFn(row: any, _columnId: string, filterValue: string) {
  if (!filterValue) return true;
  const search = String(filterValue).toLowerCase();
  const item = row.original;
  
  // Search in name, email fields
  if (item.type === 'invitation') {
    return item.email.toLowerCase().includes(search) ||
           item.inviterName.toLowerCase().includes(search);
  } else {
    return item.name.toLowerCase().includes(search) ||
           item.email.toLowerCase().includes(search);
  }
}

export function MembersTable({ members, onMemberUpdate, onInviteMember, isLoading }: MembersTableProps) {
  const columns = React.useMemo(() => createMemberColumns(onMemberUpdate), [onMemberUpdate]);

  const CustomToolbar = React.useCallback(({ table }: { table: any }) => (
    <MemberTableToolbar table={table} onInviteMember={onInviteMember} />
  ), [onInviteMember]);

  return (
    <AdminDataTable
      columns={columns}
      data={members}
      isLoading={isLoading}
      toolbar={CustomToolbar}
      title={`Organization Members (${members.filter(m => m.type === 'member').length})${members.filter(m => m.type === 'invitation').length > 0 ? ` • Pending Invitations (${members.filter(m => m.type === 'invitation').length})` : ''}`}
      description="Manage organization members and their roles. View pending invitations."
      meta={{
        globalFilterColumns: ["name", "email"],
        globalFilterFn: memberGlobalFilterFn,
      }}
    />
  );
}