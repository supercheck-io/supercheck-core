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
import { XCircle, PlusCircle } from "lucide-react";
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
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/form";
import { ControllerRenderProps } from "react-hook-form";
import { cn } from "@/lib/utils";

const jobFormSchema = z.object({
  name: z.string().min(1, "Job name is required"),
  description: z.string().optional(),
  cronSchedule: z.string().optional(),
});

type FormData = z.infer<typeof jobFormSchema>;

export default function CreateJob() {
  const router = useRouter();
  const [selectedTests, setSelectedTests] = useState<Test[]>([]);
  const [isSelectTestsDialogOpen, setIsSelectTestsDialogOpen] = useState(false);
  const [testSelections, setTestSelections] = useState<Record<string, boolean>>({});
  const [availableTests, setAvailableTests] = useState<Test[]>([]);
  const [isLoadingTests, setIsLoadingTests] = useState(true);
  const [testFilter, setTestFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const form = useForm<FormData>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: {
      name: "",
      description: "",
      cronSchedule: "",
    },
  });

  // Handle form submission
  const onSubmit = form.handleSubmit(async (values: FormData) => {
    try {
      // Validate that at least one test is selected
      if (selectedTests.length === 0) {
        toast.error("Validation Error", {
          description: "Please select at least one test for the job",
        });
        return;
      }

      // Create job data object
      const jobData = {
        name: values.name.trim(),
        description: values.description?.trim() || "",
        cronSchedule: values.cronSchedule?.trim() || "",
        tests: selectedTests.map((test) => ({ id: test.id })),
      };

      console.log("Submitting job data:", jobData);

      // Save the job to the database
      const response = await createJob(jobData);

      if (response.success) {
        toast.success("Success", {
          description: `Job \"${jobData.name}\" has been created.`,
        });

        // Navigate to the jobs page
        router.push("/jobs");
      } else {
        console.error("Failed to create job:", response.error);
        toast.error("Failed to create job", {
          description: response.error || "An unknown error occurred",
        });
      }
    } catch (error) {
      console.error("Error creating job:", error);
      toast.error("Error", {
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    }
  });

  // Define the structure expected from the getTests action
  interface ActionTest {
    id: string;
    title: string;
    description: string | null;
    // Assuming these are the possible types from the action
    type: "browser" | "api" | "multistep" | "database";
    updatedAt: string | null;
    // Add other relevant fields from the action response if needed
  }

  // Fetch tests from database on component mount
  useEffect(() => {
    async function fetchTests() {
      setIsLoadingTests(true);
      try {
        const response = await getTests();
        if (response.success && response.tests) {
          // Explicitly type the tests from the response and the mapped test
          const formattedTests: Test[] = (response.tests as ActionTest[]).map((test: ActionTest) => {
            let mappedType: Test["type"];
            // Switch on the action test type
            switch (test.type) {
              case "browser":
              case "api":
              case "multistep":
              case "database":
                mappedType = test.type; // Direct mapping
                break;
            
              default: // Handle other potential types from action
                mappedType = "browser"; // Default mapping
                break;
            }
            return {
              id: test.id,
              name: test.title,
              description: test.description || null,
              type: mappedType, // Use the mapped type conforming to Test["type"]
              status: "pending" as const,
              lastRunAt: test.updatedAt,
              duration: null as number | null,
            };
          });
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
  const handleTestSelection = (testId: string, checked: boolean) => {
    setTestSelections((prev) => ({
      ...prev,
      [testId]: checked,
    }));
  };

  // Handle test selection confirmation
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
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }: { field: ControllerRenderProps<FormData, "name"> }) => (
                    <FormItem>
                      <FormLabel>
                        Job Name <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter job name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cronSchedule"
                  render={({ field }: { field: ControllerRenderProps<FormData, "cronSchedule"> }) => (
                    <FormItem>
                      <FormLabel>
                        Cron Schedule <span className="text-gray-500">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. 0 0 * * *" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }: { field: ControllerRenderProps<FormData, "description"> }) => (
                  <FormItem>
                    <FormLabel>
                      Description <span className="text-gray-500">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Enter job description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">
                    Select Tests <span className="text-red-500">*</span>
                  </h3>
                  {selectedTests.length === 0 && (
                    <p className="text-sm text-destructive">At least one test is required</p>
                  )}
                </div>
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsSelectTestsDialogOpen(true)}
                    className={cn(
                      selectedTests.length === 0 && "border-destructive",
                      "transition-colors"
                    )}
                  >
                    <PlusCircle className={cn(
                      "mr-2 h-4 w-4",
                      selectedTests.length === 0 && "text-destructive"
                    )} />
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

                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]"></TableHead>
                              <TableHead className="w-[120px]">ID</TableHead>
                              <TableHead className="w-[200px]">Name</TableHead>
                              <TableHead className="w-[100px]">Type</TableHead>
                              <TableHead>Description</TableHead>
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
                                  <TableCell>
                                    <Checkbox
                                      checked={testSelections[test.id] || false}
                                      onCheckedChange={(checked) =>
                                        handleTestSelection(test.id, checked as boolean)
                                      }
                                    />
                                  </TableCell>
                                  <TableCell className="font-mono text-sm truncate" title={test.id}>
                                    {test.id.substring(0, 8)}...
                                  </TableCell>
                                  <TableCell className="truncate" title={test.name}>
                                    {test.name}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{test.type}</Badge>
                                  </TableCell>
                                  <TableCell className="truncate" title={test.description ?? ""}>
                                    {test.description || ""}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>

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

                {/* Display selected tests in a table */}
                {selectedTests.length > 0 && (
                  <div className="mt-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">ID</TableHead>
                          <TableHead className="w-[200px]">Name</TableHead>
                          <TableHead className="w-[100px]">Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTests.map((test) => (
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
                            <TableCell className="truncate" title={test.description ?? ""}>
                              {test.description || ""}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeTest(test.id)}
                              >
                                <XCircle className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
