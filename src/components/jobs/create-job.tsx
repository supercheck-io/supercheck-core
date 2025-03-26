"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Test } from "./data/schema";
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
import { createJob } from "@/actions/create-job";
import { toast } from "@/components/ui/use-toast";
import { Search } from "lucide-react";

export default function CreateJob() {
  const router = useRouter();
  const [selectedTests, setSelectedTests] = useState<Test[]>([]);
  const [isSelectTestsDialogOpen, setIsSelectTestsDialogOpen] = useState(false);
  const [testSelections, setTestSelections] = useState<Record<string, boolean>>(
    {}
  );
  const [activeTab, setActiveTab] = useState("basic");
  const [availableTests, setAvailableTests] = useState<Test[]>([]);
  const [isLoadingTests, setIsLoadingTests] = useState(true);
  const [testFilter, setTestFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Form state
  const [formState, setFormState] = useState({
    name: "",
    description: "",
    cronSchedule: "",
    status: "pending" as
      | "pending"
      | "running"
      | "completed"
      | "failed"
      | "cancelled",
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

  // Handle number input changes
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState({
      ...formState,
      [name]: value,
    });
  };

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
            type: test.type as
              | "api"
              | "ui"
              | "integration"
              | "performance"
              | "security",
            status: "pending" as const, // Default status since we don't have this in the test schema
            lastRunAt: test.updatedAt,
            duration: null as number | null,
          }));
          setAvailableTests(formattedTests);
        } else {
          console.error("Failed to fetch tests:", response.error);
          // Fallback to sample tests if fetch fails
          setAvailableTests(sampleTests);
        }
      } catch (error) {
        console.error("Error fetching tests:", error);
        // Fallback to sample tests if fetch fails
        setAvailableTests(sampleTests);
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
    setErrors({});

    try {
      // Validate required fields
      if (!formState.name.trim()) {
        setErrors({ name: "Job name is required" });
        return;
      }

      // Create job data object
      const jobData = {
        name: formState.name.trim(),
        description: formState.description.trim() || "",
        cronSchedule: formState.cronSchedule.trim() || "",
        timeoutSeconds: formState.timeoutSeconds
          ? parseInt(formState.timeoutSeconds)
          : 30,
        retryCount: formState.retryCount ? parseInt(formState.retryCount) : 0,
        config: {
          environment: formState.environment,
          variables: formState.variables ? JSON.parse(formState.variables) : {},
          retryStrategy: {
            maxRetries: formState.maxRetries
              ? parseInt(formState.maxRetries)
              : 3,
            backoffFactor: parseFloat(formState.backoffFactor) || 1.5,
          },
        },
        // Only pass the test IDs to avoid serialization issues
        tests: selectedTests.map((test) => ({ id: test.id })),
      };

      console.log("Submitting job data:", jobData);

      // Save the job to the database
      const response = await createJob(jobData);

      if (response.success) {
        toast({
          title: "Success",
          description: `Job "${jobData.name}" has been created.`,
        });

        // Navigate to the jobs page
        router.push("/jobs");
      } else {
        toast({
          title: "Failed to create job",
          description: response.error || "An unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error creating job:", error);

      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path) {
            errors[err.path[0]] = err.message;
          }
        });
        setErrors(errors);
      } else {
        toast({
          title: "Error",
          description:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
          variant: "destructive",
        });
      }
    }
  };

  // Remove a test from selection
  const removeTest = (testId: string) => {
    setSelectedTests(selectedTests.filter((test) => test.id !== testId));
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Create New Job</h1>
        <Button onClick={() => router.push("/jobs")}>Back to Jobs</Button>
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
                  Enter the basic information for your job.
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
                  <Label htmlFor="status">Initial Status</Label>
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
                    The initial status of the job.
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
                  Select tests to include in this job. You can add multiple
                  tests.{" "}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center items-center mb-4">
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
                  className="justify-center"
                >
                  <DialogContent className="sm:max-w-[850px] max-h-[80vh]">
                    <DialogHeader>
                      <DialogTitle>Select Tests</DialogTitle>
                      <DialogDescription>
                        Choose the tests to include in this job
                      </DialogDescription>
                    </DialogHeader>

                    {isLoadingTests ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        <span className="ml-2 text-muted-foreground">
                          Loading tests...
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="mb-4 space-y-2">
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Filter by test name, ID, or type..."
                              className="pl-8"
                              value={testFilter}
                              onChange={(e) => setTestFilter(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="max-h-[350px] overflow-y-auto">
                          <Table className="w-full">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[40px]"></TableHead>
                                <TableHead className="w-[120px] truncate">
                                  ID
                                </TableHead>
                                <TableHead className="w-[250px] truncate">
                                  Name
                                </TableHead>
                                <TableHead className="w-[100px] truncate">
                                  Type
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {availableTests
                                .filter(
                                  (test) =>
                                    testFilter === "" ||
                                    test.name
                                      .toLowerCase()
                                      .includes(testFilter.toLowerCase()) ||
                                    test.id
                                      .toLowerCase()
                                      .includes(testFilter.toLowerCase()) ||
                                    test.type
                                      .toLowerCase()
                                      .includes(testFilter.toLowerCase())
                                )
                                .slice(
                                  (currentPage - 1) * itemsPerPage,
                                  currentPage * itemsPerPage
                                )
                                .map((test) => (
                                  <TableRow key={test.id}>
                                    <TableCell className="py-2">
                                      <Checkbox
                                        checked={
                                          testSelections[test.id] || false
                                        }
                                        onCheckedChange={(checked) => {
                                          setTestSelections({
                                            ...testSelections,
                                            [test.id]: !!checked,
                                          });
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell className="font-mono text-xs truncate py-2">
                                      {test.id}
                                    </TableCell>
                                    <TableCell className="truncate py-2">
                                      <div className="truncate max-w-[250px]">
                                        {test.name}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-2">
                                      <Badge variant="outline">
                                        {test.type}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Pagination controls */}
                        <div className="flex justify-center items-center mt-4 space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCurrentPage((prev) => Math.max(prev - 1, 1))
                            }
                            disabled={currentPage === 1}
                          >
                            Previous
                          </Button>
                          <span className="text-sm">
                            Page {currentPage} of{" "}
                            {Math.max(
                              1,
                              Math.ceil(
                                availableTests.filter(
                                  (test) =>
                                    testFilter === "" ||
                                    test.name
                                      .toLowerCase()
                                      .includes(testFilter.toLowerCase()) ||
                                    test.id
                                      .toLowerCase()
                                      .includes(testFilter.toLowerCase()) ||
                                    test.type
                                      .toLowerCase()
                                      .includes(testFilter.toLowerCase())
                                ).length / itemsPerPage
                              )
                            )}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCurrentPage((prev) =>
                                Math.min(
                                  prev + 1,
                                  Math.max(
                                    1,
                                    Math.ceil(
                                      availableTests.filter(
                                        (test) =>
                                          testFilter === "" ||
                                          test.name
                                            .toLowerCase()
                                            .includes(
                                              testFilter.toLowerCase()
                                            ) ||
                                          test.id
                                            .toLowerCase()
                                            .includes(
                                              testFilter.toLowerCase()
                                            ) ||
                                          test.type
                                            .toLowerCase()
                                            .includes(testFilter.toLowerCase())
                                      ).length / itemsPerPage
                                    )
                                  )
                                )
                              )
                            }
                            disabled={
                              currentPage ===
                              Math.max(
                                1,
                                Math.ceil(
                                  availableTests.filter(
                                    (test) =>
                                      testFilter === "" ||
                                      test.name
                                        .toLowerCase()
                                        .includes(testFilter.toLowerCase()) ||
                                      test.id
                                        .toLowerCase()
                                        .includes(testFilter.toLowerCase()) ||
                                      test.type
                                        .toLowerCase()
                                        .includes(testFilter.toLowerCase())
                                  ).length / itemsPerPage
                                )
                              )
                            }
                          >
                            Next
                          </Button>
                        </div>

                        <div className="mt-4 flex justify-between items-center">
                          <div className="text-sm text-muted-foreground">
                            {
                              Object.keys(testSelections).filter(
                                (id) => testSelections[id]
                              ).length
                            }{" "}
                            test
                            {Object.keys(testSelections).filter(
                              (id) => testSelections[id]
                            ).length !== 1
                              ? "s"
                              : ""}{" "}
                            selected
                          </div>
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setIsSelectTestsDialogOpen(false)}
                            >
                              Cancel
                            </Button>
                            <Button onClick={handleTestSelectionConfirm}>
                              Add Selected Tests
                            </Button>
                          </DialogFooter>
                        </div>
                      </>
                    )}
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
            <Button type="submit">Create Job</Button>
          </div>
        </form>
      </Tabs>
    </div>
  );
}
