import * as React from "react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
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
import { DataTableSkeleton } from "@/components/ui/data-table-skeleton";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  onRowClick?: (row: Row<TData>) => void;
  meta?: {
    onDeleteTest?: (id: string) => void;
    [key: string]: unknown;
  };
}

// Define the extended meta type locally
interface ExtendedTableMeta<TData> extends TableMeta<TData> {
  globalFilterColumns?: string[];
  onDeleteTest?: (id: string) => void;
}

// Custom global filter function for tests table
function testGlobalFilterFn(row: Row<unknown>, _columnId: string, filterValue: string) {
  if (!filterValue) return true;
  const search = String(filterValue).toLowerCase();
  // Use default columns for filtering
  const columns = ["id", "title", "description", "type", "priority", "tags"];
  return columns.some((id: string) => {
    const value = row.getValue(id);
    if (typeof value === "string" || typeof value === "number") {
      return String(value).toLowerCase().includes(search);
    }
    if (id === "tags" && Array.isArray(value)) {
      return value.some(tag => tag.name.toLowerCase().includes(search));
    }
    return false;
  });
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
    React.useState<VisibilityState>({
      updatedAt: false,
    });
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [mounted, setMounted] = React.useState(false);

  // Set mounted to true after initial render
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, []);

  // Safe state setters that only run when component is mounted
  const safeSetRowSelection = React.useCallback((updaterOrValue: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
    if (mounted) {
      if (typeof updaterOrValue === 'function') {
        setRowSelection(updaterOrValue);
      } else {
        setRowSelection(updaterOrValue);
      }
    }
  }, [mounted]);
  
  const safeSetSorting = React.useCallback((updaterOrValue: SortingState | ((old: SortingState) => SortingState)) => {
    if (mounted) {
      if (typeof updaterOrValue === 'function') {
        setSorting(updaterOrValue);
      } else {
        setSorting(updaterOrValue);
      }
    }
  }, [mounted]);
  
  const safeSetColumnFilters = React.useCallback((updaterOrValue: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
    if (mounted) {
      if (typeof updaterOrValue === 'function') {
        setColumnFilters(updaterOrValue);
      } else {
        setColumnFilters(updaterOrValue);
      }
    }
  }, [mounted]);
  
  const safeSetColumnVisibility = React.useCallback((updaterOrValue: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
    if (mounted) {
      if (typeof updaterOrValue === 'function') {
        setColumnVisibility(updaterOrValue);
      } else {
        setColumnVisibility(updaterOrValue);
      }
    }
  }, [mounted]);
  
  const safeSetGlobalFilter = React.useCallback((updaterOrValue: string | ((old: string) => string)) => {
    if (mounted) {
      if (typeof updaterOrValue === 'function') {
        setGlobalFilter(updaterOrValue);
      } else {
        setGlobalFilter(updaterOrValue);
      }
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
    state: mounted ? {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
    } : {
      sorting: [],
      columnVisibility: {},
      rowSelection: {},
      columnFilters: [],
      globalFilter: "",
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
    globalFilterFn: testGlobalFilterFn,
    meta: {
      globalFilterColumns: ["id", "title", "description", "type", "priority", "tags"],
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



  // Don't render the table until the component is mounted
  if (!mounted) {
    return <DataTableSkeleton columns={5} rows={3} />;
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} />
      <div className="rounded-lg border relative">
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
