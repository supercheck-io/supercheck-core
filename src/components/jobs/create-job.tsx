"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Test } from "./data/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { CheckCircle, XCircle, Clock4, PlusCircle } from "lucide-react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTests } from "@/actions/get-tests";
import { createJob } from "@/actions/create-job";
import { toast } from "@/components/ui/use-toast";

export default function CreateJob() {
  const router = useRouter();
  const [selectedTests, setSelectedTests] = useState<Test[]>([]);
  const [isSelectTestsDialogOpen, setIsSelectTestsDialogOpen] = useState(false);
  const [testSelections, setTestSelections] = useState<Record<string, boolean>>(
    {}
  );
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
    environment: "production",
    timeoutSeconds: "30",
    retryCount: "0",
    maxRetries: "3",
    backoffFactor: "1.5",
    variables: "{}",
  });

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

    try {
      // Validate required fields
      if (!formState.name.trim()) {
        toast({
          title: "Error",
          description: "Job name is required",
          variant: "destructive",
        });
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

      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Remove a test from selection
  const removeTest = (testId: string) => {
    setSelectedTests(selectedTests.filter((test) => test.id !== testId));
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Create New Job</CardTitle>
          <CardDescription>Configure a new automated job</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Job Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formState.name}
                  onChange={handleInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cronSchedule">Cron Schedule</Label>
                <Input
                  id="cronSchedule"
                  name="cronSchedule"
                  value={formState.cronSchedule}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formState.description}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Select Tests</h3>
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSelectTestsDialogOpen(true)}
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Select Tests
                </Button>
              </div>
              <Dialog
                open={isSelectTestsDialogOpen}
                onOpenChange={setIsSelectTestsDialogOpen}
              >
                <DialogContent>
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
                                      checked={testSelections[test.id] || false}
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
                                    <Badge variant="outline">{test.type}</Badge>
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
                        <TableCell>{getTestStatusIcon(test.status)}</TableCell>
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
                  No tests selected. Click &quot;Select Tests&quot; to add tests
                  to this job.
                </div>
              )}
            </div>
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
        </CardContent>
      </Card>
    </div>
  );
}
