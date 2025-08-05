"use client";

import * as React from "react";
import { AdminDataTable } from "./admin-data-table";
import { OrgTableToolbar } from "./org-table-toolbar";
import { createOrgColumns, AdminOrganization } from "./org-columns";

interface OrgTableProps {
  organizations: AdminOrganization[];
  onOrgUpdate: () => void;
}

export function OrgTable({ organizations, onOrgUpdate }: OrgTableProps) {
  const columns = React.useMemo(() => createOrgColumns(onOrgUpdate), [onOrgUpdate]);

  return (
    <AdminDataTable
      columns={columns}
      data={organizations}
      toolbar={OrgTableToolbar}
      title="Organizations"
      description="Manage organizations and their settings"
      itemName="organizations"
      meta={{
        globalFilterColumns: ["name", "slug"],
      }}
    />
  );
}