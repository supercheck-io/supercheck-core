import type { Row } from "@tanstack/react-table";
import { MoreHorizontal, PlayIcon, PencilIcon, CopyIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

import { testSchema } from "./data/schema";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const test = testSchema.parse(row.original);

  const handleRunTest = () => {
    router.push(`/playground/${test.id}`);
  };

  const handleEditTest = () => {
    router.push(`/playground/${test.id}`);
  };

  const handleDuplicateTest = () => {
    // TODO: Implement duplicate functionality
    console.log("Duplicate test:", test.id);
  };

  const handleDeleteTest = () => {
    // TODO: Implement delete functionality
    console.log("Delete test:", test.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
        >
          <MoreHorizontal />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem onClick={handleRunTest}>
          <PlayIcon className="mr-2 h-4 w-4" />
          Run Test
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleEditTest}>
          <PencilIcon className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDuplicateTest}>
          <CopyIcon className="mr-2 h-4 w-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDeleteTest} className="text-destructive">
          <TrashIcon className="mr-2 h-4 w-4" />
          Delete
          <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
