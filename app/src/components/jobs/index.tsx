"use client";

import React, { useState, useEffect } from "react";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { jobStatuses } from "./data";
import { Job, Test } from "./schema";
import { CalendarIcon, ClockIcon, TimerIcon, Edit } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getJobs } from "@/actions/get-jobs";
import { useJobContext } from "./job-context";
import { formatDistanceToNow } from "date-fns";
import { UUIDField } from "@/components/ui/uuid-field";
import { cn } from "@/lib/utils";
import { Bell, BellOff, Shield, CheckCircle, XCircle, Clock } from "lucide-react";

// Helper function to map incoming types to the valid Test["type"]
function mapToTestType(type: string | undefined): Test["type"] {
  switch (type) {
    case "browser":
    case "api":
    case "multistep":
    case "database":
      return type; // Already valid
    case "ui":
      return "browser"; // Map ui to browser
    case "integration":
      return "multistep"; // Map integration to multistep
    // Map other legacy/incoming types or default
    case "performance":
    case "security":
    default:
      return "api"; // Default to api
  }
}

// Custom TableRow without hover effect for job sheet
const JobSheetTableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => {
  return (
    <tr
      ref={ref}
      data-slot="table-row"
      className={cn(
        "data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...props}
    />
  );
});
JobSheetTableRow.displayName = "JobSheetTableRow";

export default function Jobs() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditTestDialogOpen, setIsEditTestDialogOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const {} = useJobContext();
  const [isLoading, setIsLoading] = useState(true);

  // Fetch jobs from the database on component mount
  useEffect(() => {
    async function fetchJobs() {
      setIsLoading(true);
      try {
        const response = await getJobs();
        if (response.success && response.jobs) {
          const typedJobs = response.jobs.map((job) => ({
            ...job,
            status: job.status as Job["status"],
            description: job.description || null,
            cronSchedule: job.cronSchedule || null,
            tests: job.tests.map((test) => ({
              ...test,
              type: test.type as Test["type"],
              description: test.description || null,
              status: (test.status || "pending") as Test["status"],
              lastRunAt: test.lastRunAt || null,
              duration: test.duration || null,
            })),
            alertConfig: job.alertConfig as any,
          }));
          setJobs(typedJobs as any);
        } else {
          console.error("Failed to fetch jobs:", response.error);
          toast.error("Failed to fetch jobs", {
            description: response.error || "An unknown error occurred",
          });
        }
      } catch (error) {
        console.error("Error fetching jobs:", error);
        toast.error("Error fetching jobs", {
          description:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchJobs();
  }, []);

  // Edit an existing test
  const handleEditTest = () => {
    // Ensure selectedTest exists
    if (selectedJob && selectedTest) {
      const updatedTests =
        selectedJob.tests?.map((test) => {
          if (test.id === selectedTest.id) {
            // Use the helper function to ensure the type conforms
            const mappedType = mapToTestType(selectedTest.type);
            return { ...selectedTest, type: mappedType }; // Use the mapped type
          }
          return test;
        }) || [];

      const updatedJob = {
        ...selectedJob,
        tests: updatedTests,
      };

      // Update the selected job
      setSelectedJob(updatedJob);

      // Reset the selected test
      setSelectedTest(null);

      // Close the dialog
      setIsEditTestDialogOpen(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";

    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format relative date (e.g., "2 hours ago")
  const formatRelativeDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";

    try {
      const date = new Date(dateString);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return "Invalid date";
      }

      // Use date-fns with explicit Date type
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      console.error("Error formatting relative date:", error);
      return "Invalid date";
    }
  };

  // Check if dates match (for run date detection)
  const datesMatch = (
    date1: string | null | undefined,
    date2: string | null | undefined,
  ) => {
    if (!date1 || !date2) return false;

    try {
      const d1 = new Date(date1).getTime();
      const d2 = new Date(date2).getTime();

      // Consider dates close enough (within 5 seconds) as matching
      // This handles small timing differences in database updates
      return Math.abs(d1 - d2) < 5000;
    } catch {
      return false;
    }
  };

  const handleDeleteJob = (jobId: string) => {
    // Update local state by filtering out the deleted job
    setJobs((prevJobs) => prevJobs.filter((job) => job.id !== jobId));

    // If the deleted job is currently selected, close the sheet
    if (selectedJob && selectedJob.id === jobId) {
      setIsSheetOpen(false);
      setSelectedJob(null);
    }
  };

  // Get the true update time (ignoring run updates)
  const getTrueUpdateTime = (job: Job): string | null | undefined => {
    // If lastRunAt exists and dates match within 5 seconds, it means updatedAt was from a run, not an edit
    if (job.lastRunAt && datesMatch(job.updatedAt, job.lastRunAt)) {
      // Return the previous true update or fallback to creation date
      return job.createdAt;
    }

    // Return the actual updatedAt time
    return job.updatedAt;
  };

  return (
    <div className="flex h-full flex-col space-y-4 p-4 w-full max-w-full overflow-x-hidden">
      <DataTable
        data={jobs}
        columns={columns}
        isLoading={isLoading}
        onRowClick={(row) => {
          setSelectedJob(row.original);
          setIsSheetOpen(true);
        }}
        meta={{
          onDeleteJob: handleDeleteJob,
        }}
      />

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="xl:max-w-[800px] lg:max-w-[700px] md:max-w-[600px] sm:max-w-[500px] overflow-y-auto p-6">
          {selectedJob && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between -ml-4">
                  <SheetTitle className="text-xl font-semibold">
                    Job Details
                  </SheetTitle>
                  <div className="flex space-x-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        router.push(`/jobs/edit/${selectedJob.id}`)
                      }
                      
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Job
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Job ID and Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-card p-4 rounded-lg border border-border/40">
                  <div className="space-y-1">
                    <h3 className="text-xs font-medium text-muted-foreground">
                      Job ID
                    </h3>
                    <div className="group relative">
                      <UUIDField
                        value={selectedJob.id}
                        className="text-sm font-mono"
                        onCopy={() =>
                          toast.success("Job ID copied to clipboard")
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs font-medium text-muted-foreground">
                      Name
                    </h3>
                    <p className="text-sm font-medium">{selectedJob.name}</p>
                  </div>
                </div>

                <Tabs defaultValue="details" className="mt-6">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="tests">
                      Tests ({selectedJob.tests?.length || 0})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="py-4 space-y-6">
                    {/* Status and Schedule in a grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Status */}
                      <div className="space-y-2 bg-card p-4 rounded-lg border border-border/40">
                        <h3 className="text-xs font-medium text-muted-foreground">Status</h3>
                        <div className="flex items-center space-x-2">
                          {(() => {
                            const status = jobStatuses.find(
                              (s) => s.value === selectedJob.status,
                            );
                            return status ? (
                              <>
                                {status.icon && (
                                  <status.icon
                                    className={`h-5 w-5 ${status.color}`}
                                  />
                                )}
                                <span className="text-sm">
                                  {status.label}
                                </span>
                              </>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      
                      {/* Schedule */}
                      <div className="space-y-2 bg-card p-4 rounded-lg border border-border/40">
                        <h3 className="text-xs font-medium text-muted-foreground">Schedule</h3>
                        <div className="flex items-center space-x-2">
                          <TimerIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {selectedJob.cronSchedule || "Not scheduled"}
                          </span>
                        </div>
                      </div>
                    </div>


                    {/* Description */}
                    <div className="space-y-2 bg-card p-4 rounded-lg border border-border/40">
                      <h3 className="text-xs font-medium text-muted-foreground">Description</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedJob.description || "No description provided"}
                      </p>
                    </div>

                    {/* Timing Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-0.5 bg-card p-4 rounded-lg border border-border/40">
                        <h3 className="text-xs font-medium text-muted-foreground">Last Run</h3>
                        <div>
                          <p className="text-sm">
                            {formatDate(selectedJob.lastRunAt)}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center">
                            <CalendarIcon className="h-3 w-3 mr-1" />
                            {formatRelativeDate(selectedJob.lastRunAt)}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-0.5 bg-card p-4 rounded-lg border border-border/40">
                        <h3 className="text-xs font-medium text-muted-foreground">Next Run</h3>
                        <div>
                          <p className="text-sm">
                            {formatDate(selectedJob.nextRunAt)}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center">
                            <ClockIcon className="h-3 w-3 mr-1" />
                            {formatRelativeDate(selectedJob.nextRunAt)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-0.5 bg-card p-4 rounded-lg border border-border/40">
                        <h3 className="text-xs font-medium text-muted-foreground">Created</h3>
                        <div>
                          <p className="text-sm">
                            {formatDate(selectedJob.createdAt)}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center">
                            <CalendarIcon className="h-3 w-3 mr-1" />
                            {formatRelativeDate(selectedJob.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-0.5 bg-card p-4 rounded-lg border border-border/40">
                        <h3 className="text-xs font-medium text-muted-foreground">Updated</h3>
                        <div>
                          <p className="text-sm">
                            {formatDate(getTrueUpdateTime(selectedJob))}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center">
                            <Edit className="h-3 w-3 mr-1" />
                            {formatRelativeDate(getTrueUpdateTime(selectedJob))}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Alert Settings */}
                    <div className="space-y-2 bg-card p-4 rounded-lg border border-border/40">
                      <h3 className="text-xs font-medium text-muted-foreground">Alert Settings</h3>
                      <div className="flex items-center space-x-3">
                        {/* Alert Status Icon */}
                        <div className={`flex items-center justify-center h-8 w-8 rounded-full ${
                          selectedJob.alertConfig?.enabled 
                            ? 'bg-green-100 dark:bg-green-900/30' 
                            : 'bg-orange-100 dark:bg-orange-900/30'
                        }`}>
                          {selectedJob.alertConfig?.enabled ? (
                            <Bell className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <BellOff className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          )}
                        </div>
                        {selectedJob.alertConfig?.enabled && (
                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                            {selectedJob.alertConfig.alertOnSuccess && (
                              <CheckCircle className="h-3 w-3 text-green-600" />
                            )}
                            {selectedJob.alertConfig.alertOnFailure && (
                              <XCircle className="h-3 w-3 text-red-600" />
                            )}
                            {selectedJob.alertConfig.alertOnTimeout && (
                              <Clock className="h-3 w-3 text-orange-600" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="tests" className="py-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-medium text-muted-foreground">Tests</h3>
                    </div>

                    {selectedJob.tests && selectedJob.tests.length > 0 ? (
                      <div
                        className={cn(
                          "overflow-y-auto border rounded-md",
                          selectedJob.tests.length > 5 && "max-h-[350px]",
                        )}
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[120px] sticky top-0 bg-background">
                                ID
                              </TableHead>
                              <TableHead className="w-[200px] sticky top-0 bg-background">
                                Name
                              </TableHead>
                              <TableHead className="w-[100px] sticky top-0 bg-background">
                                Type
                              </TableHead>
                              <TableHead className="sticky top-0 bg-background">
                                Description
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedJob.tests?.map((test) => (
                              <JobSheetTableRow key={test.id}>
                                <TableCell
                                  className="font-mono text-sm truncate"
                                  title={test.id}
                                >
                                  {test.id.substring(0, 8)}...
                                </TableCell>
                                <TableCell
                                  className="truncate"
                                  title={test.name}
                                >
                                  {test.name.length > 40
                                    ? test.name.substring(0, 40) + "..."
                                    : test.name}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{test.type}</Badge>
                                </TableCell>
                                <TableCell
                                  className="truncate"
                                  title={test.description || ""}
                                >
                                  {test.description &&
                                  test.description.length > 40
                                    ? test.description.substring(0, 40) +
                                      "..."
                                    : test.description || "No description provided"}
                                </TableCell>
                              </JobSheetTableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No tests configured for this job.
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {/* Edit Test Dialog */}
                <Dialog
                  open={isEditTestDialogOpen}
                  onOpenChange={setIsEditTestDialogOpen}
                >
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Test</DialogTitle>
                      <DialogDescription>
                        Update the test details.
                      </DialogDescription>
                    </DialogHeader>
                    {selectedTest && (
                      <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="edit-test-id" className="text-right">
                            ID
                          </Label>
                          <Input
                            id="edit-test-id"
                            value={selectedTest.id}
                            className="col-span-3"
                            disabled
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label
                            htmlFor="edit-test-name"
                            className="text-right"
                          >
                            Name
                          </Label>
                          <Input
                            id="edit-test-name"
                            value={selectedTest.name}
                            onChange={(e) =>
                              setSelectedTest({
                                ...selectedTest,
                                name: e.target.value,
                              })
                            }
                            className="col-span-3"
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label
                            htmlFor="edit-test-description"
                            className="text-right"
                          >
                            Description
                          </Label>
                          <Textarea
                            id="edit-test-description"
                            value={selectedTest.description || ""}
                            onChange={(e) =>
                              setSelectedTest({
                                ...selectedTest,
                                description: e.target.value,
                              })
                            }
                            className="col-span-3"
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label
                            htmlFor="edit-test-type"
                            className="text-right"
                          >
                            Type
                          </Label>
                          <Select
                            // Display the current type, even if legacy
                            value={selectedTest?.type || ""}
                            // onValueChange receives a valid Test["type"]
                            onValueChange={(value: Test["type"]) => {
                              setSelectedTest((prev) =>
                                // Update directly with the valid type from SelectItem
                                prev ? { ...prev, type: value } : null,
                              );
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Only show valid Test['type'] options */}
                              <SelectItem value="browser">Browser</SelectItem>
                              <SelectItem value="api">API</SelectItem>
                              <SelectItem value="multistep">
                                Multistep
                              </SelectItem>
                              <SelectItem value="database">Database</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label
                            htmlFor="edit-test-status"
                            className="text-right"
                          >
                            Status
                          </Label>
                          <Select
                            value={selectedTest.status || "pending"}
                            onValueChange={(value) => {
                              // Map the UI status values to the DB status values
                              const statusMap: Record<string, "running" | "passed" | "failed" | "error" | undefined> = {
                                "pass": "passed",
                                "fail": "failed",
                                "pending": "running",
                                "skipped": undefined
                              };
                              
                              setSelectedTest({
                                ...selectedTest,
                                status: statusMap[value]
                              });
                            }}
                          >
                            <SelectTrigger className="col-span-3">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pass">Pass</SelectItem>
                              <SelectItem value="fail">Fail</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="skipped">Skipped</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsEditTestDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleEditTest}>Save Changes</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
