"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Test } from "./schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SaveIcon, Trash2 } from "lucide-react";
import { updateJob } from "@/actions/update-job";
import { getJob } from "@/actions/get-jobs";
import { deleteJob } from "@/actions/delete-job";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TestSelector from "./test-selector";

const jobFormSchema = z.object({
  name: z.string().min(1, "Job name is required"),
  description: z.string().min(1, "Job description is required"),
  cronSchedule: z.string().optional(),
});

type FormData = z.infer<typeof jobFormSchema>;

interface EditJobProps {
  jobId: string;
}

export default function EditJob({ jobId }: EditJobProps) {
  const router = useRouter();
  const [selectedTests, setSelectedTests] = useState<Test[]>([]);
  const [originalSelectedTests, setOriginalSelectedTests] = useState<Test[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [submissionAttempted, setSubmissionAttempted] = useState(false);
  const [formChanged, setFormChanged] = useState(false);
  const [initialValues, setInitialValues] = useState({
    name: "",
    description: "",
    cronSchedule: ""
  });

  const form = useForm<FormData>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: {
      name: "",
      description: "",
      cronSchedule: "",
    },
  });
  
  // Watch form values for changes
  const watchedValues = form.watch();

  // Load job data
  const loadJob = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await getJob(jobId);

      if (!response.success || !response.job) {
        // This check is now handled by the server component
        // But we'll still handle it here for robustness
        toast.error("Error", {
          description: "Job not found. Redirecting to jobs list.",
        });
        router.push("/jobs");
        return;
      }

      const jobData = response.job;
      
      // Set form values
      form.reset({
        name: jobData.name,
        description: jobData.description || "",
        cronSchedule: jobData.cronSchedule || "",
      });
      
      // Store initial values for comparison
      setInitialValues({
        name: jobData.name,
        description: jobData.description || "",
        cronSchedule: jobData.cronSchedule || ""
      });

      // Map the tests to the format expected by TestSelector
      const tests = jobData.tests.map((test) => ({
        id: test.id,
        name: test.name,
        description: test.description || null,
        type: test.type as "browser" | "api" | "multistep" | "database",
        status: "pending" as const,
        lastRunAt: null,
        duration: null,
      }));

      setSelectedTests(tests);
      setOriginalSelectedTests(tests);
    } catch (error) {
      console.error("Error loading job:", error);
      toast.error("Error", {
        description: "Failed to load job details. Please try again later.",
      });
      router.push("/jobs");
    } finally {
      setIsLoading(false);
    }
  }, [jobId, router, form]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  // Handle form submission
  const onSubmit = form.handleSubmit(async (values: FormData) => {
    setSubmissionAttempted(true);
    
    try {
      // Validate that at least one test is selected
      if (selectedTests.length === 0) {
        toast.error("Validation Error", {
          description: "Please select at least one test for the job",
        });
        return;
      }

      setIsSubmitting(true);

      // Prepare job data for submission
      const jobData = {
        id: jobId,
        name: values.name.trim(),
        description: values.description.trim(),
        cronSchedule: values.cronSchedule?.trim() || "",
        tests: selectedTests.map((test) => ({ id: test.id })),
      };

      // Submit the job data
      const response = await updateJob(jobId, jobData);

      if (!response.success) {
        throw new Error(response.error || "Failed to update job");
      }

      toast.success("Success", {
        description: "Job updated successfully.",
        duration: 5000,
      });

      // Navigate to jobs page after successful update
      router.push("/jobs");
    } catch (error) {
      console.error("Error updating job:", error);
      toast.error("Error", {
        description: 
          error instanceof Error ? error.message : "Failed to update job. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  });

  // Handle the selection of tests from the TestSelector component
  const handleTestsSelected = (tests: Test[]) => {
    setSelectedTests(tests);
  };

  // Check if the form has changed
  useEffect(() => {
    // Compare current form values with initial values
    const currentName = watchedValues.name;
    const currentDescription = watchedValues.description;
    const currentCronSchedule = watchedValues.cronSchedule || "";
    
    // Check if any form field has changed
    const formFieldsChanged = 
      currentName !== initialValues.name ||
      currentDescription !== initialValues.description ||
      currentCronSchedule !== initialValues.cronSchedule;
    
    // Compare selected tests with original tests
    const testsChanged = !(
      selectedTests.length === originalSelectedTests.length &&
      selectedTests.every(test => 
        originalSelectedTests.some(origTest => origTest.id === test.id)
      ) &&
      originalSelectedTests.every(origTest => 
        selectedTests.some(test => test.id === origTest.id)
      )
    );
    
    setFormChanged(formFieldsChanged || testsChanged);
  }, [watchedValues, initialValues, selectedTests, originalSelectedTests]);

  // Handle job deletion
  const handleDeleteJob = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteJob(jobId);
      if (!result.success) {
        throw new Error(result.error || "Failed to delete job");
      }
      toast.success("Job deleted successfully");
      router.push("/jobs");
    } catch (error) {
      console.error("Error deleting job:", error);
      toast.error("Failed to delete job");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-60">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
          <div>
            <CardTitle>Edit Job</CardTitle>
            <CardDescription className="mt-2">
              Update job details and manage associated tests
            </CardDescription>
          </div>
          <div className="flex space-x-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isSubmitting || isDeleting}
              size="sm"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({
                    field,
                  }: {
                    field: ControllerRenderProps<FormData, "name">;
                  }) => (
                    <FormItem>
                      <FormLabel>Job Name</FormLabel>
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
                  render={({
                    field,
                  }: {
                    field: ControllerRenderProps<FormData, "cronSchedule">;
                  }) => (
                    <FormItem>
                      <FormLabel>
                        Cron Schedule{" "}
                        <span className="text-gray-500">(optional)</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. 0 0 * * *"
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground mt-1">
                        Leave empty for manual execution only
                      </p>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({
                  field,
                }: {
                  field: ControllerRenderProps<FormData, "description">;
                }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Enter job description"
                        className="min-h-[100px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Use the TestSelector component */}
              <TestSelector
                selectedTests={selectedTests}
                onTestsSelected={handleTestsSelected}
                emptyStateMessage="No tests selected"
                required={submissionAttempted && selectedTests.length === 0}
              />

              <div className="flex justify-end space-x-4 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/jobs")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex items-center"
                  disabled={isSubmitting || !formChanged}
                >
                  <SaveIcon className="h-4 w-4 mr-2" />
                  {isSubmitting ? "Updating..." : "Update"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the job. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteJob();
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 