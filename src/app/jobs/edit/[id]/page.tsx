"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock4 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getTests } from "@/actions/get-tests";
import { getJob } from "@/actions/get-jobs";
import { updateJob } from "@/actions/update-job";
import { toast } from "@/components/ui/use-toast";

// Form schema for job validation
const formSchema = z.object({
  name: z.string().min(1, "Job name is required"),
  description: z.string().optional(),
  cronSchedule: z.string().optional(),
  status: z
    .enum(["pending", "running", "completed", "failed", "cancelled"])
    .default("pending"),
  environment: z.string().optional(),
  timeoutSeconds: z.coerce.number().min(1).default(1800),
  retryCount: z.coerce.number().min(0).default(0),
  maxRetries: z.coerce.number().min(0).optional(),
  backoffFactor: z.coerce.number().min(1).optional(),
  variables: z.string(),
});

interface Test {
  id: string;
  name: string;
  description: string | null;
  type: "api" | "ui" | "integration" | "performance" | "security";
  status?: "pending" | "pass" | "fail" | "skipped";
  lastRunAt?: string | null;
  duration?: number | null;
}

interface JobConfig {
  environment?: string;
  variables?: Record<string, string>;
  retryStrategy?: {
    maxRetries: number;
    backoffFactor: number;
  };
}

interface JobData {
  name: string;
  description: string;
  cronSchedule: string;
  timeoutSeconds: number;
  retryCount: number;
  config: JobConfig;
  tests: { id: string }[];
}

export default function EditJob({ params }: { params: { id: string } }) {
  const router = useRouter();
  const jobId = params.id;
  const [selectedTests, setSelectedTests] = useState<Test[]>([]);
  const [isSelectTestsDialogOpen, setIsSelectTestsDialogOpen] = useState(false);
  const [testSelections, setTestSelections] = useState<Record<string, boolean>>(
    {}
  );
  const [activeTab, setActiveTab] = useState("basic");
  const [availableTests, setAvailableTests] = useState<Test[]>([]);
  const [isLoadingTests, setIsLoadingTests] = useState(true);
  const [isLoadingJob, setIsLoadingJob] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formState, setFormState] = useState({
    name: "",
    description: "",
    cronSchedule: "",
    status: "pending" as "pending" | "running" | "completed" | "failed" | "cancelled",
    environment: "production",
    timeoutSeconds: "30",
    retryCount: "0",
    maxRetries: "3",
    backoffFactor: "1.5",
    variables: "{}",
  });

  // Form validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

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
        return <Clock4 className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock4 className="h-4 w-4 text-yellow-500" />;
    }
  };

  // Format date for display
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";

    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      }).format(date);
    } catch {
      return "Invalid Date";
    }
  };

  // Handle form input changes
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormState({
      ...formState,
      [name]: value,
    });
  };

  // Handle select changes
  const handleSelectChange = (name: string, value: string) => {
    setFormState({
      ...formState,
      [name]: value,
    });
  };

  // Fetch job data on component mount
  useEffect(() => {
    async function fetchJob() {
      setIsLoadingJob(true);
      try {
        const response = await getJob(jobId);
        if (response.success && response.job) {
          const job = response.job;
          // Set form state from job data
          setFormState({
            name: job.name,
            description: job.description || "",
            cronSchedule: job.cronSchedule || "",
            status: job.status,
            environment: job.config && typeof job.config === 'object' ? job.config.environment || "production" : "production",
            timeoutSeconds: job.timeoutSeconds?.toString() || "30",
            retryCount: job.retryCount?.toString() || "0",
            maxRetries: job.config && typeof job.config === 'object' && job.config.retryStrategy ? 
              job.config.retryStrategy.maxRetries?.toString() || "3" : "3",
            backoffFactor: job.config && typeof job.config === 'object' && job.config.retryStrategy ? 
              job.config.retryStrategy.backoffFactor?.toString() || "1.5" : "1.5",
            variables: job.config && typeof job.config === 'object' && job.config.variables ? 
              JSON.stringify(job.config.variables) : "{}",
          });

          // Set selected tests
          if (job.tests && job.tests.length > 0) {
            const formattedTests = job.tests.map((test) => ({
              id: test.id,
              name: test.name,
              description: test.description,
              type: test.type,
              status: test.status || "pending",
              lastRunAt: test.lastRunAt,
              duration: test.duration,
            }));
            setSelectedTests(formattedTests);
          }
        } else {
          console.error("Failed to fetch job:", response.error);
          toast({
            title: "Error",
            description: "Failed to load job data. " + (response.error || ""),
            variant: "destructive",
          });
          router.push("/jobs");
        }
      } catch (error) {
        console.error("Error fetching job:", error);
        toast({
          title: "Error",
          description: "Failed to load job data",
          variant: "destructive",
        });
        router.push("/jobs");
      } finally {
        setIsLoadingJob(false);
      }
    }

    fetchJob();
  }, [jobId, router]);

  // Fetch tests from database on component mount
  useEffect(() => {
    async function fetchTests() {
      setIsLoadingTests(true);
      try {
        const response = await getTests();
        if (response.success && response.tests) {
          // Convert the database test format to the format used in this component
          const formattedTests = response.tests.map((test) => ({
            id: test.id,
            name: test.title,
            description: test.description || "",
            type: test.type as "api" | "ui" | "integration" | "performance" | "security",
            status: "pending" as const, // Default status since we don't have this in the test schema
            lastRunAt: test.updatedAt,
            duration: null as number | null,
          }));
          setAvailableTests(formattedTests);
        } else {
          console.error("Failed to fetch tests:", response.error);
        }
      } catch (error) {
        console.error("Error fetching tests:", error);
      } finally {
        setIsLoadingTests(false);
      }
    }

    fetchTests();
  }, []);

  // Handle test selection
  const handleTestSelectionConfirm = () => {
    const selected = availableTests.filter((test) => testSelections[test.id]);
    setSelectedTests(selected);
    setIsSelectTestsDialogOpen(false);
  };

  useEffect(() => {
    if (isSelectTestsDialogOpen) {
      const initialSelections: Record<string, boolean> = {};
      availableTests.forEach((test) => {
        initialSelections[test.id] = selectedTests.some(
          (selected) => selected.id === test.id
        );
      });
      setTestSelections(initialSelections);
    }
  }, [isSelectTestsDialogOpen, availableTests, selectedTests]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Create job data object
      const jobData: JobData = {
        name: formState.name,
        description: formState.description,
        cronSchedule: formState.cronSchedule,
        timeoutSeconds: parseInt(formState.timeoutSeconds) || 30,
        retryCount: parseInt(formState.retryCount) || 0,
        config: {
          environment: formState.environment,
          variables: formState.variables ? JSON.parse(formState.variables) as Record<string, string> : {},
          retryStrategy: {
            maxRetries: formState.maxRetries ? parseInt(formState.maxRetries) : 3,
            backoffFactor: parseFloat(formState.backoffFactor) || 1.5,
          },
        },
        tests: selectedTests.map((test) => ({ id: test.id })),
      };

      // Validate the form data
      formSchema.parse(jobData);

      // Update the job in the database
      const response = await updateJob(jobId, jobData);

      if (response.success) {
        toast({
          title: "Success",
          description: `Job "${jobData.name}" has been updated.`,
        });

        // Navigate to the jobs page
        router.push("/jobs");
      } else {
        toast({
          title: "Failed to update job",
          description: response.error || "An unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path) {
            errors[err.path[0]] = err.message;
          }
        });
        setErrors(errors);
      } else {
        console.error("Error updating job:", error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "An unknown error occurred",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove a test from selection
  const removeTest = (testId: string) => {
    setSelectedTests(selectedTests.filter((test) => test.id !== testId));
  };

  if (isLoadingJob) {
    return (
      <div className="container mx-auto py-6 flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-lg">Loading job data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Edit Job</h1>
        <Button onClick={() => router.push("/jobs")} type="button">Back to Jobs</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="basic">Basic Information</TabsTrigger>
          <TabsTrigger value="tests">
            Tests ({selectedTests.length})
          </TabsTrigger>
        </TabsList>

        <form onSubmit={handleSubmit} className="space-y-6">
          <TabsContent value="basic" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Job Details</CardTitle>
                <CardDescription>
                  Edit the basic information for your job.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="name">Job Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Enter job name"
                    value={formState.name}
                    onChange={handleInputChange}
                  />
                  {errors.name && (
                    <p className="text-sm text-red-500">{errors.name}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    A descriptive name for your job.
                  </p>
                </div>

                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Enter job description"
                    className="resize-none"
                    value={formState.description}
                    onChange={handleInputChange}
                  />
                  {errors.description && (
                    <p className="text-sm text-red-500">{errors.description}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    A brief description of what this job does.
                  </p>
                </div>

                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="cronSchedule">Cron Schedule</Label>
                  <Input
                    id="cronSchedule"
                    name="cronSchedule"
                    placeholder="0 0 * * *"
                    value={formState.cronSchedule}
                    onChange={handleInputChange}
                  />
                  {errors.cronSchedule && (
                    <p className="text-sm text-red-500">
                      {errors.cronSchedule}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    The schedule for this job in cron format (e.g., &quot;0 0 *
                    * *&quot; for daily at midnight).
                  </p>
                </div>

                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formState.status}
                    onValueChange={(value) =>
                      handleSelectChange("status", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="running">Running</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.status && (
                    <p className="text-sm text-red-500">{errors.status}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    The current status of the job.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tests" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Tests</CardTitle>
                <CardDescription>
                  Select tests to include in this job.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-muted-foreground">
                    Select tests to include in this job. You can add multiple tests.
                  </p>
                  <Button 
                    onClick={() => setIsSelectTestsDialogOpen(true)}
                    variant="outline"
                    size="sm"
                    type="button"
                  >
                    Select Tests
                  </Button>
                </div>

                <Dialog
                  open={isSelectTestsDialogOpen}
                  onOpenChange={setIsSelectTestsDialogOpen}
                >
                  <DialogContent className="sm:max-w-[800px]">
                    <DialogHeader>
                      <DialogTitle>Select Tests</DialogTitle>
                      <DialogDescription>
                        Choose the tests to include in this job
                      </DialogDescription>
                    </DialogHeader>
                    
                    {isLoadingTests ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        <span className="ml-2 text-muted-foreground">Loading tests...</span>
                      </div>
                    ) : (
                      <>
                        <div className="max-h-[400px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead className="w-[120px]">ID</TableHead>
                                <TableHead className="w-[250px]">Name</TableHead>
                                <TableHead className="w-[100px]">Type</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {availableTests.map((test) => (
                                <TableRow key={test.id}>
                                  <TableCell>
                                    <Checkbox
                                      checked={testSelections[test.id] || false}
                                      onCheckedChange={(checked) => {
                                        setTestSelections({
                                          ...testSelections,
                                          [test.id]: !!checked,
                                        });
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{test.id}</TableCell>
                                  <TableCell>{test.name}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{test.type}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    )}
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsSelectTestsDialogOpen(false)}
                        type="button"
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleTestSelectionConfirm} type="button">
                        Add Selected Tests
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {selectedTests.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Status</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Last Run</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedTests.map((test) => (
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
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTest(test.id)}
                              type="button"
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No tests selected. Click &quot;Select Tests&quot; to add
                    tests to this job.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <div className="flex justify-end space-x-4 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/jobs")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>Update Job</Button>
          </div>
        </form>
      </Tabs>
    </div>
  );
}
