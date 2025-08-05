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
  type Table as TableType,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { AdminDataTablePagination } from "@/components/admin/admin-data-table-pagination";
import { UserTableToolbar } from "./user-table-toolbar";
import { cn } from "@/lib/utils";

interface AdminDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: Row<TData>) => void;
  meta?: {
    [key: string]: unknown;
  };
  toolbar?: React.ComponentType<{ table: TableType<TData> }>;
  title?: string;
  description?: string;
  itemName?: string;
}

// Define the extended meta type locally
interface ExtendedTableMeta<TData> extends TableMeta<TData> {
  globalFilterColumns?: string[];
  [key: string]: unknown;
}

// Custom global filter function for admin tables
function adminGlobalFilterFn(row: Row<unknown>, _columnId: string, filterValue: string) {
  if (!filterValue) return true;
  const search = String(filterValue).toLowerCase();
  // Use default columns for filtering
  const columns = ["name", "email", "role", "status"];
  return columns.some((id: string) => {
    const value = row.getValue(id);
    if (typeof value === "string" || typeof value === "number") {
      return String(value).toLowerCase().includes(search);
    }
    return false;
  });
}

export function AdminDataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  meta,
  toolbar: ToolbarComponent = UserTableToolbar,
  title,
  description,
  itemName = "items",
}: AdminDataTableProps<TData, TValue>) {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pageSize: (meta as any)?.initialPageSize || 6,
        pageIndex: 0,
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
    globalFilterFn: adminGlobalFilterFn,
    meta: {
      globalFilterColumns: ["name", "email", "role", "status"],
      ...meta,
    } as ExtendedTableMeta<TData>,
  });

  // Use useEffect to set proper pagination after the component has mounted
  React.useEffect(() => {
    if (mounted && table) {
      // Set page size based on meta or default to 6
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageSize = (meta as any)?.initialPageSize || 6;
      table.setPageSize(pageSize);
      table.setPageIndex(0);
    }
  }, [mounted, table, meta]);

  // Don't render the table until the component is mounted
  if (!mounted) {
    return null;
  }

  return (
    <div className="space-y-4">
      {(title || description) && (
        <div className="flex items-center justify-between">
          <div>
            {title && <h2 className="text-2xl font-semibold">{title}</h2>}
            {description && (
              <p className="text-muted-foreground text-sm">{description}</p>
            )}
          </div>
        </div>
      )}
      <ToolbarComponent table={table} />
      <div className="rounded-t-lg border shadow-sm relative">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-b">
                {headerGroup.headers.map((header, index) => {
                  const isFirst = index === 0;
                  const isLast = index === headerGroup.headers.length - 1;
                  return (
                    <TableHead 
                      key={header.id} 
                      className={`h-12 px-4 text-left align-middle font-semibold text-muted-foreground bg-muted/30 ${
                        isFirst ? 'rounded-tl-lg' : ''
                      } ${
                        isLast ? 'rounded-tr-lg' : ''
                      }`}
                    >
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
              table.getRowModel().rows.map((row, index) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={cn(
                    onRowClick && "cursor-pointer",
                    `transition-colors hover:bg-muted/50 ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-3 align-top">
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
      <AdminDataTablePagination table={table} itemName={itemName} />
    </div>
  );
}