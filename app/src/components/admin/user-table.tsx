"use client";

import * as React from "react";
import { AdminDataTable } from "./admin-data-table";
import { UserTableToolbar } from "./user-table-toolbar";
import { createUserColumns, AdminUser } from "./user-columns";

interface UserTableProps {
  users: AdminUser[];
  onUserUpdate: () => void;
  onCreateUser?: () => void;
}

export function UserTable({ users, onUserUpdate, onCreateUser }: UserTableProps) {
  const columns = React.useMemo(() => createUserColumns(onUserUpdate), [onUserUpdate]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomToolbar = React.useCallback(({ table }: { table: any }) => (
    <UserTableToolbar table={table} onCreateUser={onCreateUser} />
  ), [onCreateUser]);

  return (
    <AdminDataTable
      columns={columns}
      data={users}
      toolbar={CustomToolbar}
      title="Users"
      description="Manage system users and their roles"
      itemName="users"
      meta={{
        globalFilterColumns: ["name", "email", "role"],
      }}
    />
  );
}