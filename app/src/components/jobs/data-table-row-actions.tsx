import type { Row } from "@tanstack/react-table";
import { MoreHorizontal, Trash2, Edit } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { toast } from "sonner";
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
import { useState } from "react";
import { deleteJob } from "@/actions/delete-job";

import { Job } from "./schema";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  onDelete?: () => void;
}

export function DataTableRowActions<TData>({
  row,
  onDelete,
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const job = row.original as unknown as Job;
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleEditJob = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click event
    router.push(`/jobs/edit/${job.id}`);
  };

  const handleDeleteJob = async () => {
    if (!job.id) return;

    setIsDeleting(true);

    try {
      // Use the server action to delete the job
      const result = await deleteJob(job.id);

      if (!result.success) {
        // If error is "Job not found", job may have been deleted already
        if (result.error === "Job not found") {
          // Show a warning instead of an error
          toast.warning("Job already deleted", {
            description: "This job was already deleted or doesn't exist. Refreshing view."
          });
          
          // Refresh anyway to update the UI
          if (onDelete) {
            onDelete();
          }
          router.refresh();
          return;
        }
        
        // For other errors, throw the error to be caught below
        throw new Error(result.error || "Failed to delete job");
      }

      toast.success("Job deleted successfully");
  
      // Call onDelete callback if provided
      if (onDelete) {
        onDelete();
      }

      // Refresh the page to update the job list
      router.refresh();
    } catch (error) {
      console.error("Error deleting job:", error);
      toast.error("Error deleting job", {
        description:
          error instanceof Error ? error.message : "Failed to delete job",
        duration: 5000, // Add auto-dismiss after 5 seconds
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
          <DropdownMenuItem onClick={handleEditJob}>
            <Edit className="mr-2 h-4 w-4" />
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
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the job <span className="font-semibold">&quot;{job.name}&quot;</span> This action cannot be undone. 
              <br /><br />
              <strong>Note:</strong> All the runs related to this job will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteJob();
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
