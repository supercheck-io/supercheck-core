import type { ColumnDef } from "@tanstack/react-table";
import { CalendarIcon, TimerIcon, Play, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { jobStatuses } from "./data/data";
import type { Job } from "./data/schema";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useJobContext } from "./job-context";

// Type definition for the extended meta object used in this table
interface JobsTableMeta {
  onDeleteJob?: (id: string) => void;
  globalFilterColumns?: string[];
  // Include other potential properties from the base TableMeta if needed
}

// Create a proper React component for the run button
function RunButton({ job }: { job: Job }) {
  const [isRunning, setIsRunning] = useState(false);
  const router = useRouter();
  const { isAnyJobRunning, setJobRunning } = useJobContext();

  const handleRunJob = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click event
    e.preventDefault(); // Prevent opening the sheet

    if (isRunning || isAnyJobRunning) {
      if (isAnyJobRunning) {
        toast.error("Cannot run job", {
          description: "Another job is currently running. Please wait for it to complete.",
        });
      }
      return;
    }

    let runToastId: string | number | undefined = undefined; // Initialize with undefined

    try {
      setIsRunning(true);
      setJobRunning(true);

      if (!job.tests || job.tests.length === 0) {
        toast.error("Cannot run job", {
          description: "This job has no tests associated with it.",
        });
        // Reset state if returning early
        setIsRunning(false);
        setJobRunning(false);
        return;
      }

      // Show a loading toast that stays visible during the entire job execution
      runToastId = toast.loading(`Running job: ${job.name}`, {
        description: "The job is being executed. This may take a few moments...",
        duration: Infinity, // Keep loading until dismissed/updated
      });

      // Prepare the test data
      const testData = job.tests.map((test) => ({
        id: test.id,
        name: test.name || "",
        title: test.name || "", // Include title as a fallback
      }));

      // Call the API endpoint for running jobs
      const response = await fetch("/api/jobs/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: job.id,
          tests: testData,
        }),
        cache: "no-store",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to run job: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      // Show a result toast with more detailed information
      if (data.success) {
        toast.success("Job completed successfully", {
          description: (
            <>
              Ran {data.results.length} tests. All tests passed.{" "}
              <a href={`/runs/${data.runId}`} className="underline font-medium">
                View Run Report
              </a>
            </>
          ),
          duration: 10000,
          id: runToastId,
        });
      } else {
        toast.error("Job execution failed", {
          description: (
            <>
              One or more tests did not complete successfully.{" "}
              <a href={`/runs/${data.runId}`} className="underline font-medium">
                View Run Report
              </a>
            </>
          ),
          duration: 10000,
          id: runToastId,
        });
      }

      // Remove automatic navigation
      // if (data.runId) {
      //   router.push(`/runs/${data.runId}`);
      // }

      // Refresh the page to show updated job status
      router.refresh();
    } catch (error) {
      console.error("Error running job:", error);
      // Update the loading toast to show error, if it exists
      toast.error("Error running job", {
        description: "Failed to execute the job. Please try again later.",
        id: runToastId,
      });
    } finally {
      setIsRunning(false);
      setJobRunning(false);
    }
  };

  return (
    <Button
      onClick={handleRunJob}
      size="sm"
      variant="default"
      className={cn(
        "bg-blue-500 hover:bg-blue-600",
        "text-white",
        "shadow-sm",
        "transition-all duration-200",
        "flex items-center justify-center",
        "h-8 w-8 rounded-full p-0",
        "cursor-pointer",
        (isRunning || isAnyJobRunning) && "opacity-80 cursor-not-allowed"
      )}
      disabled={isRunning || isAnyJobRunning || !job.tests || job.tests.length === 0}
      title={
        isAnyJobRunning
          ? "Another job is currently running"
          : !job.tests || job.tests.length === 0
          ? "No tests available to run"
          : "Run job"
      }
    >
      {isRunning ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
    </Button>
  );
}

export const columns: ColumnDef<Job>[] = [
  {
    id: "run",
    header: () => <div>Run</div>,
    cell: ({ row }) => {
      const job = row.original;
      return <RunButton job={job} />;
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => (
      <div className="w-[100px] ml-2 truncate">{row.getValue("id")}</div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex space-x-2">
          <span className="max-w-[200px] truncate font-medium">
            {row.getValue("name")}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "description",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Description" />
    ),
    cell: ({ row }) => {
      const description = row.getValue("description") as string | null;
      return (
        <div className="max-w-[200px] truncate">
          {description || "No description"}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = jobStatuses.find(
        (status) => status.value === row.getValue("status")
      );

      if (!status) {
        return null;
      }

      return (
        <div className="flex w-[120px] items-center">
          {status.icon && (
            <status.icon className={`mr-2 h-4 w-4 ${status.color}`} />
          )}
          <span>{status.label}</span>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "cronSchedule",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Schedule" />
    ),
    cell: ({ row }) => {
      const cronSchedule = row.getValue("cronSchedule") as string | null;
      return (
        <div className="flex items-center">
          <TimerIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>{cronSchedule || "Not scheduled"}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "lastRunAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Last Run" />
    ),
    cell: ({ row }) => {
      const lastRunAt = row.getValue("lastRunAt") as string | null;
      if (!lastRunAt) {
        return <div className="text-muted-foreground">Never</div>;
      }
      return (
        <div className="flex items-center">
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span>
            {new Date(lastRunAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      // Explicitly cast table.options.meta to the extended type
      const meta = table.options.meta as JobsTableMeta | undefined;
      const onDeleteCallback = meta?.onDeleteJob;

      return (
        <DataTableRowActions
          row={row}
          onDelete={onDeleteCallback ? () => onDeleteCallback(row.original.id) : undefined}
        />
      );
    },
  },
];
