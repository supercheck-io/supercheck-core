import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import type { Test } from "./schema";
import { CalendarIcon, ClockIcon, TagIcon } from "lucide-react";
import { UUIDField } from "@/components/ui/uuid-field";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

// Type definition for the extended meta object used in this table
interface TestsTableMeta {
  onDeleteTest?: (id: string) => void;
  globalFilterColumns?: string[];
  // Include other potential properties from the base TableMeta if needed
}

import { priorities, types } from "./data";

export const columns: ColumnDef<Test>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader className="ml-2"  column={column} title="Test ID" />
    ),
    cell: ({ row }) => (
      <div className="w-[90px]">
        
        <UUIDField 
          value={row.getValue("id")} 
          maxLength={24} 
          onCopy={() => toast.success("Test ID copied to clipboard")}
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      const title = row.getValue("title") as string;
      
      // Check if text is likely to be truncated (rough estimate)
      const isTruncated = title.length > 20; // Approximate character limit for 200px width
      
      if (!isTruncated) {
        return (
          <div className="flex space-x-2">
            <span className="max-w-[170px] truncate">
              {title.length > 20 ? title.slice(0, 20) + "..." : title}
            </span>
          </div>
        );
      }
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex space-x-2">
                <span className="max-w-[170px] truncate">
                  {title}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[1200px]">
              <span>{title}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  // {
  //   accessorKey: "description",
  //   header: ({ column }) => (
  //     <DataTableColumnHeader column={column} title="Description" />
  //   ),
  //   cell: ({ row }) => {
  //     const description = row.getValue("description") as string | null;
  //     return (
  //       <div className="max-w-[200px] truncate">
  //         {description || "No description provided"}
  //       </div>
  //     );
  //   },
  // },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = types.find((type) => type.value === row.getValue("type"));

      if (!type) {
        return null;
      }

      return (
        <div className="flex items-center w-[120px]">
          {type.icon && <type.icon className={`mr-2 h-4 w-4 ${type.color}`} />}
          <span>{type.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },

  {
    accessorKey: "priority",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Priority" />
    ),
    cell: ({ row }) => {
      const priority = priorities.find(
        (priority) => priority.value === row.getValue("priority")
      );

      if (!priority) {
        return null;
      }

      return (
        <div className="flex items-center w-[100px]">
          {priority.icon && (
            <priority.icon
              className={`mr-2 h-4 w-4 text-muted-foreground ${priority.color}`}
            />
          )}
          <span>{priority.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },

  {
    accessorKey: "tags",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tags" />
    ),
    cell: ({ row }) => {
      const tags = row.getValue("tags") as Array<{ id: string; name: string; color: string | null }>;
      
      if (!tags || tags.length === 0) {
        return (
          <div className="text-muted-foreground text-sm">
            No tags
          </div>
        );
      }

      const displayTags = tags.slice(0, 2);
      const remainingCount = tags.length - 2;

      // Only show tooltip if there are more than 2 tags
      if (tags.length <= 2) {
        return (
          <div className="flex items-center gap-1 min-h-[24px]">
            {tags.map((tag) => (
              <Badge 
                key={tag.id} 
                variant="secondary" 
                className="text-xs whitespace-nowrap flex-shrink-0"
                style={tag.color ? { backgroundColor: tag.color + "20", color: tag.color } : {}}
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        );
      }

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 min-h-[24px]">
                {displayTags.map((tag) => (
                  <Badge 
                    key={tag.id} 
                    variant="secondary" 
                    className="text-xs whitespace-nowrap flex-shrink-0"
                    style={tag.color ? { backgroundColor: tag.color + "20", color: tag.color } : {}}
                  >
                    {tag.name}
                  </Badge>
                ))}
                {remainingCount > 0 && (
                  <Badge variant="secondary" className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    +{remainingCount}
                  </Badge>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[1200px]">
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Badge 
                    key={tag.id} 
                    variant="secondary" 
                    className="text-xs"
                    style={tag.color ? { backgroundColor: tag.color + "20", color: tag.color } : {}}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    filterFn: (row, id, value: string[]) => {
      const tags = row.getValue(id) as Array<{ id: string; name: string; color: string | null }>;
      if (!tags || tags.length === 0) return false;
      return value.some(filterTag => 
        tags.some(tag => tag.name.toLowerCase().includes(filterTag.toLowerCase()))
      );
    },
  },

  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      const createdAt = row.getValue("createdAt") as string;
      if (!createdAt) return null;

      // Format date without using date-fns
      const date = new Date(createdAt);
      const formattedDate = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return (
        <div className="flex items-center w-[120px]">
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>{formattedDate}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Updated" />
    ),
    cell: ({ row }) => {
      const updatedAt = row.getValue("updatedAt") as string;
      if (!updatedAt) return null;

      // Format date without using date-fns
      const date = new Date(updatedAt);
      const formattedDate = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      return (
        <div className="flex items-center w-[120px]">
          <ClockIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>{formattedDate}</span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      // Explicitly cast table.options.meta to the extended type
      const meta = table.options.meta as TestsTableMeta | undefined;
      const onDeleteCallback = meta?.onDeleteTest;

      return (
        <DataTableRowActions
          row={row}
          onDelete={
            onDeleteCallback
              ? () => onDeleteCallback(row.original.id)
              : undefined
          }
        />
      );
    },
  },
];
