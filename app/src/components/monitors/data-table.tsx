"use client";

import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type Row,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  TableMeta,
} from "@tanstack/react-table";
import { Loader2 } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  onRowClick?: (row: Row<TData>) => void;
  meta?: {
    onDeleteMonitor?: (id: string) => void;
    [key: string]: unknown;
  };
}

// Define the extended meta type locally
interface ExtendedTableMeta<TData> extends TableMeta<TData> {
  globalFilterColumns?: string[];
  onDeleteMonitor?: (id: string) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  onRowClick,
  meta,
}: DataTableProps<TData, TValue>) {
  const [mounted, setMounted] = React.useState(false);
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    updatedAt: false,
  });
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  // Set mounted to true after initial render
  React.useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
    };
  }, []);

  // Safe state setters that only run when component is mounted
  const safeSetRowSelection = React.useCallback((value: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
    if (mounted) {
      setRowSelection(value);
    }
  }, [mounted]);
  
  const safeSetSorting = React.useCallback((value: SortingState | ((old: SortingState) => SortingState)) => {
    if (mounted) {
      setSorting(value);
    }
  }, [mounted]);
  
  const safeSetColumnFilters = React.useCallback((value: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
    if (mounted) {
      setColumnFilters(value);
    }
  }, [mounted]);
  
  const safeSetColumnVisibility = React.useCallback((value: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
    if (mounted) {
      setColumnVisibility(value);
    }
  }, [mounted]);
  
  const safeSetGlobalFilter = React.useCallback((value: string | ((old: string) => string)) => {
    if (mounted) {
      setGlobalFilter(value);
    }
  }, [mounted]);

  const table = useReactTable({
    data,
    columns,
    initialState: {
      pagination: {
        pageSize: 12,
      },
    },
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
    },
    enableRowSelection: true,
    onRowSelectionChange: safeSetRowSelection,
    onSortingChange: safeSetSorting,
    onColumnFiltersChange: safeSetColumnFilters,
    onColumnVisibilityChange: safeSetColumnVisibility,
    onGlobalFilterChange: safeSetGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: "auto",
    meta: {
      globalFilterColumns: ["id", "name","target", "type", "status"],
      ...meta,
    } as ExtendedTableMeta<TData>,
  });

  // Use useEffect to reset pagination after the component has mounted
  React.useEffect(() => {
    // Only reset if there's data and the component is mounted
    if (data.length > 0 && mounted) {
      // Use setTimeout to ensure this runs after the current render cycle
      setTimeout(() => {
        if (mounted) {
          table.resetPageIndex(true);
        }
      }, 0);
    }
  }, [data, table, mounted]);



  // Don't render anything until mounted to prevent hydration issues
  if (!mounted) {
    return <DataTableSkeleton columns={5} rows={3} />;
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} />
      <div className="rounded-t-lg border relative">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex justify-center items-center space-x-2">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Loading data...
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={() => onRowClick?.(row)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
} 