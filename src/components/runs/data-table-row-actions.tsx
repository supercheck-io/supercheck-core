"use client";

import { Row } from "@tanstack/react-table";
import { FileIcon, MoreHorizontal, ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TestRun } from "./data/schema";
import { useRouter } from "next/navigation";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const run = row.original as TestRun;
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        {run.reportUrl && (
          <DropdownMenuItem
            onClick={() => window.open(run.reportUrl as string, "_blank")}
          >
            <FileIcon className="mr-2 h-4 w-4" />
            <span>View Report</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem
          onClick={() => router.push(`/jobs/${run.jobId}`)}
        >
          <ExternalLinkIcon className="mr-2 h-4 w-4" />
          <span>View Job</span>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={() => router.push(`/runs/${run.id}`)}
        >
          <FileIcon className="mr-2 h-4 w-4" />
          <span>View Details</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
