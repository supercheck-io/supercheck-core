"use client";

import * as React from "react";
import { AdminDataTable } from "@/components/admin/admin-data-table";
import { ProjectTableToolbar } from "./project-table-toolbar";
import { createProjectColumns, type Project } from "./project-columns";

interface ProjectsTableProps {
  projects: Project[];
  onCreateProject: () => void;
  onEditProject?: (project: Project) => void;
}



export function ProjectsTable({ projects, onCreateProject, onEditProject }: ProjectsTableProps) {
  const columns = React.useMemo(() => createProjectColumns(onEditProject), [onEditProject]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomToolbar = React.useCallback(({ table }: { table: any }) => (
    <ProjectTableToolbar table={table} onCreateProject={onCreateProject} />
  ), [onCreateProject]);

  return (
    <AdminDataTable
      columns={columns}
      data={projects}
      toolbar={CustomToolbar}
      title="Projects"
      description="Manage projects within your organization. Create, edit, and organize projects."
      itemName="projects"
      meta={{
        globalFilterColumns: ["name", "description"],
      }}
    />
  );
}