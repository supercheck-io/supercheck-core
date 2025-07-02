"use client";

import { X } from "lucide-react";
import type { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableViewOptions } from "@/components/jobs/data-table-view-options";
import { DataTableFacetedFilter } from "@/components/jobs/data-table-faceted-filter";
import { runStatuses } from "./data";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
}

export function DataTableToolbar<TData>({
  table,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0 || !!table.getState().globalFilter;

  return (
    <div className="flex items-center justify-between mb-4 -mt-2">
      <div className="flex items-center justify-between space-y-2">
        <div className="flex flex-col">
          <h2 className="text-2xl font-semibold">Runs</h2>
          <p className="text-muted-foreground text-sm">
            View Job runs and their results
          </p>
        </div>
     
      </div>
      <div className="flex items-center space-x-2">
        <Input
          placeholder="Filter by Run ID, Job ID, or Job Name..."
          value={(table.getState().globalFilter as string) ?? ""}
          onChange={(event) => table.setGlobalFilter(event.target.value)}
          className="h-8 w-[200px] lg:w-[350px]"
        />
        {table.getColumn("status") && (
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title="Status"
            options={runStatuses}
          />
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              table.resetColumnFilters();
              table.setGlobalFilter("");
            }}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
