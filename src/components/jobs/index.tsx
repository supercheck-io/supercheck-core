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
import { jobStatuses } from "./data/data";
import { Job, Test } from "./data/schema";
import {
  CalendarIcon,
  ClockIcon,
  TimerIcon,
  Edit,
  PlayIcon,
  Loader2,
} from "lucide-react";
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
import { toast } from "@/components/ui/use-toast";
import { getJobs } from "@/actions/get-jobs";
import { cn } from "@/lib/utils";
import { useJobContext } from "./job-context";

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

export default function Jobs() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isEditTestDialogOpen, setIsEditTestDialogOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [isRunningJob, setIsRunningJob] = useState(false);
  const { isAnyJobRunning, setJobRunning } = useJobContext();
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
            status: job.status as Job['status'],
            description: job.description || null,
            cronSchedule: job.cronSchedule || null,
            tests: job.tests.map((test) => ({
              ...test,
              type: test.type as Test['type'],
              description: test.description || null,
              status: (test.status || "pending") as Test['status'],
              lastRunAt: test.lastRunAt || null,
              duration: test.duration || null,
            })),
          }));
          setJobs(typedJobs);
        } else {
          console.error("Failed to fetch jobs:", response.error);
          toast({
            title: "Failed to fetch jobs",
            description: response.error || "An unknown error occurred",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error fetching jobs:", error);
        toast({
          title: "Error fetching jobs",
          description:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchJobs();
  }, []);

  const refreshJobs = async () => {
    setIsLoading(true);
    try {
      const response = await getJobs();
      if (response.success && response.jobs) {
        const typedJobs = response.jobs.map((job) => ({
          ...job,
          status: job.status as Job['status'],
          description: job.description || null,
          cronSchedule: job.cronSchedule || null,
          tests: job.tests.map((test) => ({
            ...test,
            type: test.type as Test['type'],
            description: test.description || null,
            status: (test.status || "pending") as Test['status'],
            lastRunAt: test.lastRunAt || null,
            duration: test.duration || null,
          })),
        }));
        setJobs(typedJobs);
      }
    } catch (error) {
      console.error("Error refreshing jobs:", error);
    } finally {
      setIsLoading(false);
    }
  };

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

  // Function to run a job
  const runJob = async (job: Job) => {
    if (isAnyJobRunning) {
      toast({
        title: "Cannot run job",
        description: "Another job is currently running. Please wait for it to complete.",
        variant: "destructive",
      });
      return;
    }

    if (!job.tests || job.tests.length === 0) {
      toast({
        title: "No tests to run",
        description: "This job doesn't have any tests to run.",
        variant: "destructive",
      });
      return;
    }

    setIsRunningJob(true);
    setJobRunning(true);

    try {
      console.log("Running job:", job.id);

      // Prepare the test data
      const testData = job.tests.map((test) => ({
        id: test.id,
        name: test.name || "",
        title: test.name || "", // Include title as a fallback
      }));

      // Use the dedicated API endpoint for running jobs
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

      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        throw new Error(`Failed to run job: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log("Response data:", data);

      // Update the job status based on the test results
      const finalJob = {
        ...job,
        status: data.success ? ("completed" as const) : ("failed" as const),
        lastRunAt: new Date().toISOString(),
      };

      // Update the local state
      setSelectedJob(finalJob);

      toast({
        title: data.success ? "Job completed successfully" : "Job failed",
        description: `Ran ${data.results.length} tests. ${
          data.results.filter((r: { success: boolean }) => r.success).length
        } passed, ${
          data.results.filter((r: { success: boolean }) => !r.success).length
        } failed.`,
        variant: data.success ? "default" : "destructive",
      });

      // Navigate to the runs page if a runId is returned
      if (data.runId) {
        console.log("Navigating to run:", data.runId);
        router.push(`/runs/${data.runId}`);
      } else {
        console.warn("No runId returned from API");
      }
    } catch (error) {
      console.error("Error running job:", error);

      toast({
        title: "Failed to run job",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });

      // Update the job status to failed
      const failedJob = {
        ...job,
        status: "failed" as const,
      };

      // Update the local state
      setSelectedJob(failedJob);
    } finally {
      setIsRunningJob(false);
      setJobRunning(false);
      refreshJobs();
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

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <DataTable
        data={jobs}
        columns={columns}
        isLoading={isLoading}
        onRowClick={(row) => {
          setSelectedJob(row.original);
          setIsSheetOpen(true);
        }}
      />

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="xl:max-w-[800px] lg:max-w-[700px] md:max-w-[600px] sm:max-w-[500px] overflow-y-auto p-6">
          {selectedJob && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between -ml-4">
                  <SheetTitle>Job Details</SheetTitle>
                  <div className="flex space-x-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/jobs/edit/${selectedJob.id}`)}
                      className="cursor-pointer"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Job
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => selectedJob && runJob(selectedJob)}
                      disabled={
                        isRunningJob ||
                        isAnyJobRunning ||
                        !selectedJob ||
                        !selectedJob.tests ||
                        selectedJob.tests.length === 0
                      }
                      className={cn(
                        "bg-blue-500 hover:bg-blue-600",
                        "text-white",
                        "shadow-sm",
                        "transition-all duration-200",
                        "flex items-center gap-2",
                        "cursor-pointer",
                        (isRunningJob || isAnyJobRunning) && "opacity-80 cursor-not-allowed"
                      )}
                      title={
                        isAnyJobRunning
                          ? "Another job is currently running"
                          : !selectedJob?.tests || selectedJob.tests.length === 0
                          ? "No tests available to run"
                          : "Run job"
                      }
                    >
                      {isRunningJob ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <PlayIcon className="h-4 w-4" />
                          Run Job
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Job ID and Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <h3 className="text-xs text-muted-foreground">Job ID</h3>
                    <p className="text-sm font-mono">{selectedJob.id}</p>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xs text-muted-foreground">Name</h3>
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
                    {/* Status */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Status</h3>
                      <div className="flex items-center space-x-2">
                        {(() => {
                          const status = jobStatuses.find(
                            (s) => s.value === selectedJob.status
                          );
                          return status ? (
                            <>
                              {status.icon && (
                                <status.icon
                                  className={`h-5 w-5 ${status.color}`}
                                />
                              )}
                              <span className="font-medium">{status.label}</span>
                            </>
                          ) : null;
                        })()}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Description</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedJob.description || "No description provided"}
                      </p>
                    </div>

                    {/* Schedule */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Schedule</h3>
                      <div className="flex items-center space-x-2">
                        <TimerIcon className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedJob.cronSchedule || "Not scheduled"}</span>
                      </div>
                    </div>

                    {/* Timing Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium">Last Run</h3>
                        <div className="flex items-center space-x-2">
                          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          <span>{formatDate(selectedJob.lastRunAt)}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium">Next Run</h3>
                        <div className="flex items-center space-x-2">
                          <ClockIcon className="h-4 w-4 text-muted-foreground" />
                          <span>{formatDate(selectedJob.nextRunAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1">
                        <h3 className="text-xs text-muted-foreground">Created</h3>
                        <p className="text-sm">
                          {formatDate(selectedJob.createdAt)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xs text-muted-foreground">Updated</h3>
                        <p className="text-sm">
                          {formatDate(selectedJob.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="tests" className="py-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-medium">Tests</h3>
                    </div>

                    {selectedJob.tests && selectedJob.tests.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[120px]">ID</TableHead>
                            <TableHead className="w-[200px]">Name</TableHead>
                            <TableHead className="w-[100px]">Type</TableHead>
                            <TableHead>Description</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedJob.tests.map((test) => (
                            <TableRow key={test.id}>
                              <TableCell className="font-mono text-sm truncate" title={test.id}>
                                {test.id.substring(0, 8)}...
                              </TableCell>
                              <TableCell className="truncate" title={test.name}>
                                {test.name}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{test.type}</Badge>
                              </TableCell>
                              <TableCell className="truncate" title={test.description || ""}>
                                {test.description}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
                          <Label htmlFor="edit-test-name" className="text-right">
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
                          <Label htmlFor="edit-test-type" className="text-right">
                            Type
                          </Label>
                          <Select
                            // Display the current type, even if legacy
                            value={selectedTest?.type || ""}
                            // onValueChange receives a valid Test["type"]
                            onValueChange={(value: Test["type"]) => {
                              setSelectedTest((prev) =>
                                // Update directly with the valid type from SelectItem
                                prev ? { ...prev, type: value } : null
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
                              <SelectItem value="multistep">Multistep</SelectItem>
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
                            onValueChange={(
                              value: "pass" | "fail" | "pending" | "skipped"
                            ) =>
                              setSelectedTest({ ...selectedTest, status: value })
                            }
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
