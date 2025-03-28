import type { Table } from "@tanstack/react-table";
import { X, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableViewOptions } from "./data-table-view-options";
import { useRouter } from "next/navigation";

import { priorities, types } from "./data/data";

import { DataTableFacetedFilter } from "./data-table-faceted-filter";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
}

export function DataTableToolbar<TData>({
  table,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;
  const router = useRouter();

  const handleCreateTest = () => {
    router.push("/playground?scriptType=browser");
  };

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tests</h2>
          <p className="text-muted-foreground">View and manage all tests</p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Input
          placeholder="Filter tests..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("title")?.setFilterValue(event.target.value)
          }
          className="h-8 w-[150px] lg:w-[200px]"
        />

        {table.getColumn("priority") && (
          <DataTableFacetedFilter
            column={table.getColumn("priority")}
            title="Priority"
            options={priorities}
          />
        )}

        {table.getColumn("type") && (
          <DataTableFacetedFilter
            column={table.getColumn("type")}
            title="Type"
            options={types}
          />
        )}

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}

        <DataTableViewOptions table={table} />

        <Button
          onClick={handleCreateTest}
          size="sm"
          className="h-8 cursor-pointer"
        >
          <PlusIcon className="mr-2 h-4 w-4" /> New Test
        </Button>
      </div>
    </div>
  );
}
