"use client";
import { useRouter, useParams } from "next/navigation";
import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { XCircle } from "lucide-react";
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
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { PlusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { tests, jobs } from "@/db/schema";

type DbTest = typeof tests.$inferSelect;
type DbJob = typeof jobs.$inferSelect;

export type TestPriority = "low" | "medium" | "high";
export type TestType = "browser" | "api" | "multistep" | "database";

// Map UI test type to database test type
function mapTestType(uiType: string): TestType {
  switch (uiType) {
    case "ui":
      return "browser";
    case "integration":
      return "multistep";
    case "performance":
      return "database";
    case "api":
      return "api";
    default:
      return "api";
  }
}

interface JobData {
  id: string;
  name: string;
  description: string;
  cronSchedule: string;
  tests: { id: string }[];
}

export default function EditJob() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [selectedTests, setSelectedTests] = useState<DbTest[]>([]);
  const [isSelectTestsDialogOpen, setIsSelectTestsDialogOpen] = useState(false);
  const [testSelections, setTestSelections] = useState<Record<string, boolean>>({});
  const [availableTests, setAvailableTests] = useState<DbTest[]>([]);
  const [isLoadingJob, setIsLoadingJob] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTests, setIsLoadingTests] = useState(true);
  const [testFilter, setTestFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Jobs", href: "/jobs" },
    { label: "Edit", isCurrentPage: true },
    { label: jobId, href: `/jobs/${jobId}`, isCurrentPage: true },
  ];

  // Form state
  const [formState, setFormState] = useState<Partial<DbJob>>({
    name: "",
    description: "",
    cronSchedule: "",
  });

  const updateFormState = (field: keyof DbJob, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value || "",
    }));
  };

  const loadJob = useCallback(async () => {
    try {
      setIsLoadingJob(true);
      const response = await getJob(jobId);

      if (!response.success || !response.job) {
        throw new Error(response.error || "Job not found");
      }

      const job = response.job;
      setFormState({
        name: job.name,
        description: job.description,
        cronSchedule: job.cronSchedule,
      });

      // Map the tests from the action response to the DbTest structure required by the state
      const tests = job.tests.map((test): DbTest => ({
        id: test.id,
        title: test.name, // Map 'name' from action to 'title' for UI state
        description: test.description || null, // Ensure description can be null
        type: test.type, // Use the type directly from the action response
        // Ensure other required DbTest fields have default/appropriate values
        script: "", // Provide a default empty script
        priority: "medium" as TestPriority, // Cast default priority
        createdAt: null, // Set to null
        updatedAt: null, // Set to null
      }));

      setSelectedTests(tests);
      setAvailableTests(tests);
    } catch (error) {
      console.error("Error loading job:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to load job details",
        variant: "destructive",
      });
      router.push("/jobs");
    } finally {
      setIsLoadingJob(false);
    }
  }, [jobId, router]);

  const loadAvailableTests = useCallback(async () => {
    try {
      setIsLoadingTests(true);
      const response = await getTests();
      if (!response.success || !response.tests) {
        throw new Error("Failed to load tests");
      }

      const tests = response.tests.map((test) => ({
        id: test.id,
        title: test.title,
        description: test.description || "",
        type: test.type as TestType,
        script: test.script || "",
        priority: test.priority || "medium",
        createdAt: test.createdAt,
        updatedAt: test.updatedAt,
      }));

      setAvailableTests(tests);
    } catch (error) {
      console.error("Error loading tests:", error);
      toast({
        title: "Error",
        description: "Failed to load available tests",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTests(false);
    }
  }, []);

  useEffect(() => {
    loadJob();
    loadAvailableTests();
  }, [loadJob, loadAvailableTests]);

  const handleTestSelection = (testId: string, checked: boolean) => {
    setTestSelections((prev) => ({
      ...prev,
      [testId]: checked,
    }));
  };

  const handleSelectTests = () => {
    const selected = availableTests.filter((test) => testSelections[test.id]);
    setSelectedTests(selected);
    setIsSelectTestsDialogOpen(false);
  };

  const removeTest = (testId: string) => {
    setSelectedTests((prev) => prev.filter((test) => test.id !== testId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!formState.name?.trim()) {
        toast({
          title: "Error",
          description: "Job name is required",
          variant: "destructive",
        });
        return;
      }

      const jobData = {
        id: jobId,
        name: formState.name.trim(),
        description: formState.description?.trim() || "",
        cronSchedule: formState.cronSchedule?.trim() || "",
        tests: selectedTests.map((test) => ({ id: test.id })),
      };

      const response = await updateJob(jobId, jobData);

      if (!response.success) {
        throw new Error(response.error || "Failed to update job");
      }

      toast({
        title: "Success",
        description: "Job updated successfully",
      });
      router.push("/jobs");
    } catch (error) {
      console.error("Error updating job:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update job",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingJob) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <PageBreadcrumbs items={breadcrumbs} />
      <Card>
        <CardHeader>
          <CardTitle>Edit Job</CardTitle>
          <CardDescription>Update job configuration</CardDescription>
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
                  onChange={(e) => updateFormState("name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cronSchedule">Cron Schedule</Label>
                <Input
                  id="cronSchedule"
                  name="cronSchedule"
                  value={formState.cronSchedule || ""}
                  onChange={(e) => updateFormState("cronSchedule", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formState.description || ""}
                onChange={(e) => updateFormState("description", e.target.value)}
              />
            </div>
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Selected Tests</h3>
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
              {selectedTests.length > 0 && (
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
                        <TableCell className="truncate" title={test.title}>
                          {test.title}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{test.type}</Badge>
                        </TableCell>
                        <TableCell className="truncate" title={test.description || ""}>
                          {test.description}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTest(test.id)}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Updating..." : "Update Job"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
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
                          test.title
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
                                handleTestSelection(
                                  test.id,
                                  checked as boolean
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm truncate" title={test.id}>
                            {test.id.substring(0, 8)}...
                          </TableCell>
                          <TableCell className="truncate" title={test.title}>
                            {test.title}
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
              </div>
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
                          test.title
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
                                test.title
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
                            test.title
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
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSelectTestsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={handleSelectTests}>
                  Confirm Selection
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
