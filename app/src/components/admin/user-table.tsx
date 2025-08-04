"use client";

import * as React from "react";
import { AdminDataTable } from "./admin-data-table";
import { UserTableToolbar } from "./user-table-toolbar";
import { createUserColumns, AdminUser } from "./user-columns";

interface UserTableProps {
  users: AdminUser[];
  onUserUpdate: () => void;
  isLoading?: boolean;
}

export function UserTable({ users, onUserUpdate, isLoading }: UserTableProps) {
  const columns = React.useMemo(() => createUserColumns(onUserUpdate), [onUserUpdate]);

  return (
    <AdminDataTable
      columns={columns}
      data={users}
      isLoading={isLoading}
      toolbar={UserTableToolbar}
      title="Users"
      description="Manage system users and their roles"
      meta={{
        globalFilterColumns: ["name", "email", "role"],
      }}
    />
  );
}