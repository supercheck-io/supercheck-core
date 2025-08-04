"use client";

import * as React from "react";
import { AdminDataTable } from "./admin-data-table";
import { OrgTableToolbar } from "./org-table-toolbar";
import { createOrgColumns, AdminOrganization } from "./org-columns";

interface OrgTableProps {
  organizations: AdminOrganization[];
  onOrgUpdate: () => void;
  isLoading?: boolean;
}

export function OrgTable({ organizations, onOrgUpdate, isLoading }: OrgTableProps) {
  const columns = React.useMemo(() => createOrgColumns(onOrgUpdate), [onOrgUpdate]);

  return (
    <AdminDataTable
      columns={columns}
      data={organizations}
      isLoading={isLoading}
      toolbar={OrgTableToolbar}
      title="Organizations"
      description="Manage organizations and their settings"
      meta={{
        globalFilterColumns: ["name", "slug"],
      }}
    />
  );
}