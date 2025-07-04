import type { ColumnDef } from "@tanstack/react-table";
import { CalendarIcon, TimerIcon, Loader2, Zap, Clock } from "lucide-react";
import { useRef, useCallback, useEffect } from "react";

import type { Job } from "./schema";
import { DataTableColumnHeader } from "./data-table-column-header";
import { DataTableRowActions } from "./data-table-row-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useJobContext, JobStatusDisplay } from "./job-context";
import { UUIDField } from "@/components/ui/uuid-field";

// Type definition for the extended meta object used in this table
interface JobsTableMeta {
  onDeleteJob?: (id: string) => void;
  globalFilterColumns?: string[];
  // Include other potential properties from the base TableMeta if needed
}

// Create a proper React component for the run button
function RunButton({ job }: { job: Job }) {
  const { isJobRunning, setJobRunning, startJobRun } = useJobContext();
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Get job running state from global context
  const isRunning = isJobRunning(job.id);

  // Cleanup function to handle SSE connection close
  const closeSSEConnection = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('[RunButton] Closing existing SSE connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      closeSSEConnection();
    };
  }, [closeSSEConnection]);

  const handleRunJob = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); // Prevent row click event
    e.preventDefault(); // Prevent opening the sheet

    // Only prevent execution if this specific job is running
    if (isRunning) {
      return;
    }

    try {
      // Close any existing SSE connection first
      closeSSEConnection();
      
      // Set just this job as running
      setJobRunning(true, job.id);

      if (!job.tests || job.tests.length === 0) {
        toast.error("Cannot run job", {
          description: "This job has no tests associated with it.",
        });
        // Reset state if returning early
        setJobRunning(false, job.id);
        return;
      }

      // Prepare the test data
      const testData = job.tests.map((test) => ({
        id: test.id,
        name: test.name || "",
        title: test.name || "",
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
      console.log("[RunButton] Job queued successfully:", data);

      if (data.runId) {
        // Use the global job context to manage toast notifications and SSE
        startJobRun(data.runId, job.id, job.name);
      } else {
        // No runId received, something is wrong
        toast.error("Error running job", {
          description: "Failed to get run ID for the job.",
        });
        setJobRunning(false, job.id);
      }
    } catch (error) {
      console.error("[RunButton] Error running job:", error);
      
      // Get error message directly from the response if possible
      let errorMessage = "Unknown error";
      
      if (error instanceof Error) {
        const message = error.message;
        
        // Try to extract the more specific error message from the JSON string
        if (message.includes('429')) {
          errorMessage = "Queue capacity limit reached. Please try again later.";
        } else {
          // Use the original error message but trim it to be more concise
          errorMessage = message.replace("Failed to run job: ", "");
          
          // Limit the length of the error message
          if (errorMessage.length > 100) {
            errorMessage = errorMessage.substring(0, 100) + "...";
          }
        }
      }
      
      toast.error("Error running job", {
        description: errorMessage
      });
      
      setJobRunning(false, job.id);
    }
  };

  return (
    <Button
      onClick={handleRunJob}
      size="sm"
      variant="default"
      className={cn(
        "bg-[hsl(221.2,83.2%,53.3%)] hover:bg-[hsl(221.2,83.2%,48%)]",
        "text-white",
        "flex items-center justify-center",
        "h-7 px-1 rounded-md",
        "gap-2",
        "cursor-pointer",
        "ml-1"
      )}
      disabled={
        isRunning || !job.tests || job.tests.length === 0
      }
      title={
        isRunning
          ? "Job is currently running"
          : !job.tests || job.tests.length === 0
          ? "No tests available to run"
          : "Run job"
      }
    >
      {isRunning ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Running...</span>
        </>
      ) : (
        <>
          <Zap className="h-4 w-4" />
          <span className="text-xs">Run</span>
        </>
      )}
    </Button>
  );
}

export const columns: ColumnDef<Job>[] = [
  {
    id: "run",
    header: () => <div className="ml-2">Run</div>,
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
      <div className="w-[120px] ml-2">
        <UUIDField 
          value={row.getValue("id")} 
          maxLength={24} 
          onCopy={() => toast.success("ID copied to clipboard")}
        />
      </div>
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
          <span className="max-w-[200px] truncate">
            {row.getValue("name")}
          </span>
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
      const jobId = row.getValue("id") as string;
      const dbStatus = row.getValue("status") as string;
      
      return <JobStatusDisplay jobId={jobId} dbStatus={dbStatus} />;
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
        <div className="flex flex-col">
          <div className="flex items-center">
            <Clock className="mr-2 h-4 w-4 text-muted-foreground self-center" />
            <div className="flex items-center">
              <span>
                {new Date(lastRunAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <span className="text-muted-foreground ml-1 text-xs">
              {new Date(lastRunAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "nextRunAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Next Run" />
    ),
    cell: ({ row }) => {
      const nextRunAt = row.getValue("nextRunAt") as string | null;
      const cronSchedule = row.getValue("cronSchedule") as string | null;
      
      if (!cronSchedule || !nextRunAt) {
        return <div className="text-muted-foreground">N/A</div>;
      }
      
      return (
        <div className="flex flex-col">
          <div className="flex items-center">
          <Clock className="mr-2 h-4 w-4 text-muted-foreground self-center" />
          <div className="flex items-center">
            <span>
              {new Date(nextRunAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
            <span className="text-muted-foreground ml-1 text-xs">
            {new Date(nextRunAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          </div>
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
