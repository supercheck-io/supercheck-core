import type { Table } from "@tanstack/react-table";
import { PlusCircle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableViewOptions } from "@/components/monitors/data-table-view-options";
import { useRouter } from "next/navigation";

import { monitorStatuses, monitorTypes } from "@/components/monitors/data";

import { DataTableFacetedFilter } from "./data-table-faceted-filter";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
}

export function DataTableToolbar<TData>({
  table,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0 || !!table.getState().globalFilter;
  const router = useRouter();

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <Input
            placeholder="Filter by ID or Name..."
            value={(table.getState().globalFilter as string) ?? ""}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className="h-8 w-[200px] lg:w-[250px]"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">

        {table.getColumn("status") && (
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title="Status"
            options={monitorStatuses}
          />
        )}
        {table.getColumn("type") && (
          <DataTableFacetedFilter
            column={table.getColumn("type")}
            title="Type"
            options={monitorTypes}
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
        <Button
          onClick={() => router.push("/monitors/create")}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          New Monitor
        </Button>
      </div>
    </div>
  );
} 