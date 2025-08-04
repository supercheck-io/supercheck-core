import type { Table } from "@tanstack/react-table";
import { X, Search, Filter, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTableViewOptions } from "@/components/tests/data-table-view-options";
import { DataTableFacetedFilter } from "@/components/tests/data-table-faceted-filter";

import { auditActions } from "./audit-data";

interface AuditTableToolbarProps<TData> {
  table: Table<TData>;
  onRefresh: () => void;
  availableActions?: string[];
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

export function AuditTableToolbar<TData>({
  table,
  onRefresh,
  availableActions = [],
  pageSize,
  onPageSizeChange,
}: AuditTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  // Filter audit actions to only show those that exist in the data
  const availableAuditActions = auditActions.filter(action => 
    availableActions.length === 0 || availableActions.includes(action.value)
  );

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search audit logs..."
            value={(table.getState().globalFilter as string) ?? ""}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className="h-8 w-[250px] pr-8 pl-8"
          />
          {(table.getState().globalFilter as string)?.length > 0 && (
            <button
              type="reset"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500 rounded-sm bg-red-200 p-0.5"
              onClick={() => table.setGlobalFilter("")}
              tabIndex={0}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {table.getColumn("action") && availableAuditActions.length > 0 && (
          <DataTableFacetedFilter
            column={table.getColumn("action")}
            title="Action"
            options={availableAuditActions}
          />
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <Select
          value={pageSize.toString()}
          onValueChange={(value) => onPageSizeChange(parseInt(value))}
        >
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <DataTableViewOptions table={table} />
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="h-8"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    </div>
  );
}