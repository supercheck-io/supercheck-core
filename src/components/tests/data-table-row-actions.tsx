import type { Row } from "@tanstack/react-table";
import { MoreHorizontal, PencilIcon, TrashIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";

import { testSchema } from "./data/schema";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const test = testSchema.parse(row.original);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleEditTest = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click event
    router.push(`/playground/${test.id}`);
  };

  const handleDeleteTest = async () => {
    if (!test.id) return;

    setIsDeleting(true);

    // Show a loading toast for delete operation
    toast({
      title: "Deleting test...",
      description: "Please wait while we delete the test.",
      duration: 3000,
    });

    try {
      // Call the DELETE endpoint to remove the test
      const response = await fetch(`/api/tests?id=${test.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Check for the specific 409 Conflict status code
        if (response.status === 409) {
          toast({
            title: "Cannot Delete Test",
            description: errorData.error || "This test is currently used in a job.",
            variant: "destructive",
            duration: 5000, // Show for longer
          });
        } else {
          // Throw error for other non-ok responses
          throw new Error(errorData.error || "Failed to delete test");
        }
        // Return early after handling the error toast
        return;
      }

      toast({
        title: "Test deleted successfully",
        description: `Test &quot;${test.title}&quot; has been permanently removed.`,
        variant: "default",
      });

      // Refresh the page to update the test list
      router.refresh();
    } catch (error) {
      console.error("Error deleting test:", error);
      toast({
        title: "Error deleting test",
        description:
          error instanceof Error ? error.message : "Failed to delete test",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={handleEditTest}>
            <PencilIcon className="mr-2 h-4 w-4" />
            <span>Edit</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteDialog(true);
            }}
            className="text-red-600"
          >
            <TrashIcon className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the test &quot;{test.title}&quot;.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteTest();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
