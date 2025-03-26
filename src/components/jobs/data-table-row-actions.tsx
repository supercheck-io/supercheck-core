import type { Row } from "@tanstack/react-table";
import { MoreHorizontal, Play, Trash2, Edit } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { toast } from "@/components/ui/use-toast";

import { jobStatuses } from "./data/data";
import { Job } from "./data/schema";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
}

export function DataTableRowActions<TData>({
  row,
}: DataTableRowActionsProps<TData>) {
  const router = useRouter();
  const job = row.original as unknown as Job;

  const handleEditJob = () => {
    router.push(`/jobs/edit/${job.id}`);
  };

  const handleRunJob = async () => {
    try {
      console.log("Job data:", job);
      
      // Make sure we have the job ID
      if (!job.id) {
        toast({
          title: "Cannot run job",
          description: "Invalid job ID.",
          variant: "destructive",
        });
        return;
      }
      
      // Check if tests are available
      if (!job.tests || !Array.isArray(job.tests) || job.tests.length === 0) {
        toast({
          title: "Cannot run job",
          description: "This job has no tests associated with it.",
          variant: "destructive",
        });
        return;
      }

      // Show a loading toast
      toast({
        title: "Running job",
        description: "The job is being executed...",
      });

      console.log("Running job with ID:", job.id);
      console.log("Tests to run:", job.tests);
      
      // Prepare the test data - ensure we're only sending the required fields
      const testData = job.tests.map(test => ({
        id: test.id,
        name: test.name || "",
        title: test.name || "" // Include title as a fallback
      }));
      
      // Call the dedicated API endpoint for running jobs
      const response = await fetch(`/api/jobs/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: job.id,
          tests: testData,
        }),
        // Prevent caching issues
        cache: 'no-store',
      });

      console.log("Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        throw new Error(`Failed to run job: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log("Response data:", data);

      toast({
        title: "Job executed",
        description: data.success 
          ? "All tests completed successfully." 
          : "Some tests failed. Check the job details for more information.",
        variant: data.success ? "default" : "destructive",
      });
      
      // Refresh the page to show updated job status
      router.refresh();
    } catch (error) {
      console.error("Error running job:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to run job",
        variant: "destructive",
      });
    }
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
        <DropdownMenuItem onClick={handleEditJob}>
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleRunJob}>
          <Play className="mr-2 h-4 w-4" />
          Run Now
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={job.status}>
              {jobStatuses.map((status) => (
                <DropdownMenuRadioItem key={status.value} value={status.value}>
                  {status.icon && <status.icon className={`mr-2 h-4 w-4 ${status.color}`} />}
                  {status.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
          Delete
          <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
