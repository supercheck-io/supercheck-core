import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type Row,
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
      globalFilterColumns: ["id", "name", "url"],
      ...meta,
    } as ExtendedTableMeta<TData>,
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
      <div className={cn("rounded-md border", 
        isLoading ? "relative min-h-[300px]" : ""
      )}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    onRowClick ? "hover:bg-muted cursor-pointer" : "",
                    "h-16" // Match the height from runs table
                  )}
                  onClick={(e) => handleRowClick(e, row)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell 
                      key={cell.id}
                      className={cn(
                        "py-4", // Match the padding from runs table
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