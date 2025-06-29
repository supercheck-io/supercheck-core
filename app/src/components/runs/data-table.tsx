"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  Row,
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
import { cn } from "@/lib/utils";

// Define a more specific meta type
interface TableMeta {
  globalFilterColumns?: string[];
  onDelete?: () => void;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  onRowClick?: (row: Row<TData>) => void;
  meta?: TableMeta;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  onRowClick,
  meta,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  // Create a ref to track if the component is mounted
  const isMounted = React.useRef(false);

  // Set mounted to true after initial render
  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Safe state setters that only run when component is mounted
  const safeSetRowSelection = React.useCallback((value: any) => {
    if (isMounted.current) {
      setRowSelection(value);
    }
  }, []);
  
  const safeSetSorting = React.useCallback((value: any) => {
    if (isMounted.current) {
      setSorting(value);
    }
  }, []);
  
  const safeSetColumnFilters = React.useCallback((value: any) => {
    if (isMounted.current) {
      setColumnFilters(value);
    }
  }, []);
  
  const safeSetColumnVisibility = React.useCallback((value: any) => {
    if (isMounted.current) {
      setColumnVisibility(value);
    }
  }, []);
  
  const safeSetGlobalFilter = React.useCallback((value: any) => {
    if (isMounted.current) {
      setGlobalFilter(value);
    }
  }, []);

  const table = useReactTable({
    data,
    columns,
    initialState: {
      pagination: {
        pageSize: 15,
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
      globalFilterColumns: ["id", "jobName", "jobId"],
      ...meta,
    } as TableMeta,
  });

  // Use useEffect to reset pagination after the component has mounted
  React.useEffect(() => {
    // Only reset if there's data and the component is mounted
    if (data.length > 0 && isMounted.current) {
      table.resetPageIndex(true);
    }
  }, [data, table]);

  // Handle row clicks while checking for action column clicks
  const handleRowClick = (e: React.MouseEvent, row: Row<TData>) => {
    const target = e.target as HTMLElement;
    
    // Check if the click was inside or on a dropdown menu or button
    if (
      target.closest('.actions-column') || 
      target.closest('[role="menuitem"]') || 
      target.closest('[role="menu"]') || 
      target.closest('button')
    ) {
      return; // Don't process row click
    }
    
    // Process row click if handler provided
    if (onRowClick) {
      onRowClick(row);
    }
  };

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} />
      <div className="rounded-md border relative">
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
                  className={cn(
                    onRowClick ? "hover:bg-muted cursor-pointer" : ""
                  )}
                  onClick={(e) => handleRowClick(e, row)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "py-2",
                        cell.column.id === "actions" ? "actions-column" : ""
                      )}
                    >
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
