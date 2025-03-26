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
  Settings2Icon,
  PlusCircle,
  Edit,
  Trash,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock4,
  PlayIcon,
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
  DialogTrigger,
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

export default function Jobs() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAddTestDialogOpen, setIsAddTestDialogOpen] = useState(false);
  const [isEditTestDialogOpen, setIsEditTestDialogOpen] = useState(false);
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [isRunningJob, setIsRunningJob] = useState(false);
  const [newTest, setNewTest] = useState<Partial<Test>>({
    id: `TEST-${Math.floor(Math.random() * 1000)}`,
    name: "",
    description: "",
    type: "api",
    status: "pending",
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch jobs from the database on component mount
  useEffect(() => {
    async function fetchJobs() {
      setIsLoading(true);
      try {
        const response = await getJobs();
        if (response.success && response.jobs) {
          // Convert the job status to the expected type
          const typedJobs = response.jobs.map((job) => ({
            ...job,
            status: job.status as
              | "pending"
              | "running"
              | "completed"
              | "failed"
              | "cancelled",
            description: job.description || null,
            cronSchedule: job.cronSchedule || null,
            tests: job.tests.map((test) => ({
              ...test,
              description: test.description || null,
              status: (test.status || "pending") as
                | "pending"
                | "pass"
                | "fail"
                | "skipped",
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
    try {
      const response = await getJobs();
      if (response.success && response.jobs) {
        const typedJobs = response.jobs.map((job) => ({
          ...job,
          status: job.status as
            | "pending"
            | "running"
            | "completed"
            | "failed"
            | "cancelled",
          description: job.description || null,
          cronSchedule: job.cronSchedule || null,
          tests: job.tests.map((test) => ({
            ...test,
            description: test.description || null,
            status: (test.status || "pending") as
              | "pending"
              | "pass"
              | "fail"
              | "skipped",
            lastRunAt: test.lastRunAt || null,
            duration: test.duration || null,
          })),
        }));
        setJobs(typedJobs);
      }
    } catch (error) {
      console.error("Error refreshing jobs:", error);
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

  // Format duration in a human-readable way
  const formatDuration = (duration: number | null | undefined) => {
    if (duration === null || duration === undefined) return "N/A";

    if (duration < 1000) {
      return `${duration}ms`;
    } else if (duration < 60000) {
      return `${(duration / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(duration / 60000);
      const seconds = Math.floor((duration % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  };

  // Get status icon for test
  const getTestStatusIcon = (status: string | undefined) => {
    switch (status) {
      case "pass":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending":
        return <Clock4 className="h-4 w-4 text-yellow-500" />;
      case "skipped":
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock4 className="h-4 w-4 text-yellow-500" />;
    }
  };

  // Add a new test to the selected job
  const handleAddTest = () => {
    if (selectedJob && newTest.name) {
      const updatedJob = {
        ...selectedJob,
        tests: [
          ...(selectedJob.tests || []),
          {
            id: newTest.id || `TEST-${Math.floor(Math.random() * 1000)}`,
            name: newTest.name,
            description: newTest.description || null,
            type: newTest.type as
              | "api"
              | "ui"
              | "integration"
              | "performance"
              | "security",
            status: newTest.status,
            lastRunAt: new Date().toISOString(),
            duration: null,
          },
        ],
      };

      // Update the selected job
      setSelectedJob(updatedJob);

      // Reset the new test form
      setNewTest({
        id: `TEST-${Math.floor(Math.random() * 1000)}`,
        name: "",
        description: "",
        type: "api",
        status: "pending",
      });

      // Close the dialog
      setIsAddTestDialogOpen(false);
    }
  };

  // Edit an existing test
  const handleEditTest = () => {
    if (selectedJob && selectedTest) {
      const updatedTests =
        selectedJob.tests?.map((test) =>
          test.id === selectedTest.id ? { ...selectedTest } : test
        ) || [];

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

  // Delete a test
  const handleDeleteTest = (testId: string) => {
    if (selectedJob) {
      const updatedTests =
        selectedJob.tests?.filter((test) => test.id !== testId) || [];

      const updatedJob = {
        ...selectedJob,
        tests: updatedTests,
      };

      // Update the selected job
      setSelectedJob(updatedJob);
    }
  };

  // Function to run a job
  const runJob = async (job: Job) => {
    if (!job.tests || job.tests.length === 0) {
      toast({
        title: "No tests to run",
        description: "This job doesn't have any tests to run.",
        variant: "destructive",
      });
      return;
    }

    setIsRunningJob(true);

    try {
      console.log("Running job:", job.id);
      
      // Prepare the test data
      const testData = job.tests.map(test => ({
        id: test.id,
        name: test.name || "",
        title: test.name || "" // Include title as a fallback
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

      // Update the job status based on the test results
      const finalJob = {
        ...job,
        status: data.success ? "completed" as const : "failed" as const,
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
        description: error instanceof Error ? error.message : "An unknown error occurred",
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
      
      // Refresh the jobs list
      refreshJobs();
    }
  };

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Jobs</h1>
        <Button onClick={() => router.push("/jobs/create")}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Create New Job
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading jobs...
        </div>
      ) : (
        <DataTable
          data={jobs}
          columns={columns}
          onRowClick={(row) => {
            setSelectedJob(row.original);
            setIsSheetOpen(true);
          }}
        />
      )}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="xl:max-w-[800px] lg:max-w-[700px] md:max-w-[600px] sm:max-w-[500px] overflow-y-auto">
          {selectedJob && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between">
                  <SheetTitle>Job Details</SheetTitle>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSheetOpen(false)}
                    >
                      Close
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => selectedJob && runJob(selectedJob)}
                      disabled={
                        isRunningJob ||
                        !selectedJob ||
                        !selectedJob.tests ||
                        selectedJob.tests.length === 0
                      }
                    >
                      {isRunningJob ? (
                        <>
                          <span className="animate-spin mr-2">
                            <ClockIcon className="h-4 w-4" />
                          </span>
                          Running...
                        </>
                      ) : (
                        <>
                          <PlayIcon className="h-4 w-4 mr-2" />
                          Run Job
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <Tabs defaultValue="details" className="mt-6">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="details">Job Details</TabsTrigger>
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

                  {/* Configuration */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Configuration</h3>
                    <div className="rounded-md bg-muted p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Settings2Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Environment:</span>
                        <Badge variant="outline">
                          {selectedJob.config?.environment || "Default"}
                        </Badge>
                      </div>

                      {selectedJob.config?.variables && (
                        <div className="space-y-2 mt-4">
                          <h4 className="text-xs font-medium">Variables</h4>
                          <div className="grid grid-cols-1 gap-2">
                            {Object.entries(selectedJob.config.variables).map(
                              ([key, value]) => (
                                <div key={key} className="flex justify-between">
                                  <span className="text-xs text-muted-foreground">
                                    {key}:
                                  </span>
                                  <span className="text-xs font-mono">
                                    {value}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {selectedJob.config?.retryStrategy && (
                        <div className="space-y-2 mt-4">
                          <h4 className="text-xs font-medium">
                            Retry Strategy
                          </h4>
                          <div className="grid grid-cols-1 gap-2">
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">
                                Max Retries:
                              </span>
                              <span className="text-xs">
                                {selectedJob.config.retryStrategy.maxRetries}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-muted-foreground">
                                Backoff Factor:
                              </span>
                              <span className="text-xs">
                                {selectedJob.config.retryStrategy.backoffFactor}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            Timeout
                          </span>
                          <span className="text-sm">
                            {selectedJob.timeoutSeconds} seconds
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            Retry Count
                          </span>
                          <span className="text-sm">
                            {selectedJob.retryCount}
                          </span>
                        </div>
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
                    <Dialog
                      open={isAddTestDialogOpen}
                      onOpenChange={setIsAddTestDialogOpen}
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <PlusCircle className="h-4 w-4 mr-2" />
                          Add Test
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add New Test</DialogTitle>
                          <DialogDescription>
                            Add a new test to this job. Fill in the details
                            below.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="test-id" className="text-right">
                              ID
                            </Label>
                            <Input
                              id="test-id"
                              value={newTest.id || ""}
                              className="col-span-3"
                              disabled
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="test-name" className="text-right">
                              Name
                            </Label>
                            <Input
                              id="test-name"
                              value={newTest.name || ""}
                              onChange={(e) =>
                                setNewTest({ ...newTest, name: e.target.value })
                              }
                              className="col-span-3"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label
                              htmlFor="test-description"
                              className="text-right"
                            >
                              Description
                            </Label>
                            <Textarea
                              id="test-description"
                              value={newTest.description || ""}
                              onChange={(e) =>
                                setNewTest({
                                  ...newTest,
                                  description: e.target.value,
                                })
                              }
                              className="col-span-3"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="test-type" className="text-right">
                              Type
                            </Label>
                            <Select
                              value={newTest.type}
                              onValueChange={(
                                value:
                                  | "api"
                                  | "ui"
                                  | "integration"
                                  | "performance"
                                  | "security"
                              ) => setNewTest({ ...newTest, type: value })}
                            >
                              <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select test type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="api">API</SelectItem>
                                <SelectItem value="ui">UI</SelectItem>
                                <SelectItem value="integration">
                                  Integration
                                </SelectItem>
                                <SelectItem value="performance">
                                  Performance
                                </SelectItem>
                                <SelectItem value="security">
                                  Security
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setIsAddTestDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button onClick={handleAddTest}>Add Test</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {selectedJob.tests && selectedJob.tests.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">Status</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Last Run</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedJob.tests.map((test) => (
                          <TableRow key={test.id}>
                            <TableCell>
                              {getTestStatusIcon(test.status)}
                            </TableCell>
                            <TableCell className="font-medium">
                              {test.name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{test.type}</Badge>
                            </TableCell>
                            <TableCell>{formatDate(test.lastRunAt)}</TableCell>
                            <TableCell>
                              {formatDuration(test.duration)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end space-x-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedTest(test);
                                    setIsEditTestDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteTest(test.id)}
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No tests found for this job. Click &quot;Add Test&quot; to
                      create one.
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
                          value={selectedTest.type}
                          onValueChange={(
                            value:
                              | "api"
                              | "ui"
                              | "integration"
                              | "performance"
                              | "security"
                          ) =>
                            setSelectedTest({ ...selectedTest, type: value })
                          }
                        >
                          <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select test type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="api">API</SelectItem>
                            <SelectItem value="ui">UI</SelectItem>
                            <SelectItem value="integration">
                              Integration
                            </SelectItem>
                            <SelectItem value="performance">
                              Performance
                            </SelectItem>
                            <SelectItem value="security">Security</SelectItem>
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
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
