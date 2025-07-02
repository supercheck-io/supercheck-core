"use client";

import React, { useState, useEffect } from "react";
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
import { SaveIcon } from "lucide-react";
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
import TestSelector from "./test-selector";
import CronScheduler from "./cron-scheduler";
import { Info, Loader2 } from "lucide-react";
import NextRunDisplay from "./next-run-display";

const jobFormSchema = z.object({
  name: z.string().min(1, "Job name is required"),
  description: z.string().min(1, "Job description is required"),
  cronSchedule: z.string().optional(),
});

type FormData = z.infer<typeof jobFormSchema>;

interface CreateJobProps {
  hideAlerts?: boolean;
  onSave?: (data: any) => void;
  onCancel?: () => void;
}

export function CreateJob({ hideAlerts = false, onSave, onCancel }: CreateJobProps) {
  const router = useRouter();
  const [selectedTests, setSelectedTests] = useState<Test[]>([]);
  const [submissionAttempted, setSubmissionAttempted] = useState(false);
  const [formChanged, setFormChanged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Handle form submission
  const onSubmit = form.handleSubmit(async (values: FormData) => {
    setSubmissionAttempted(true);
    setIsSubmitting(true);

    // Ensure cronSchedule is a valid cron string or empty, default to '*' if empty but intended
    // react-js-cron defaults to '*' when initialized empty, let's reflect that maybe?
    // Or ensure it's explicitly empty string if user clears it.
    // For now, we trim and use empty string if cleared.
    const cronValue = values.cronSchedule?.trim() || ""; 

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
        description: values.description.trim(),
        cronSchedule: cronValue, // Use the processed cron value
        tests: selectedTests.map((test) => ({ id: test.id })),
      };

      console.log("Submitting job data:", jobData);

      // If onSave callback is provided (wizard mode), use it instead of API call
      if (onSave) {
        onSave(jobData);
        return;
      }

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
          description: typeof response.error === 'string' ? response.error : "An unknown error occurred",
        });
      }
    } catch (error) {
      console.error("Error creating job:", error);
      toast.error("Error", {
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  });

  // Handle the selection of tests from the TestSelector component
  const handleTestsSelected = (tests: Test[]) => {
    setSelectedTests(tests);
  };

  // Track form changes
  useEffect(() => {
    // Check if form fields have values
    const formHasValues = 
      (watchedValues.name && watchedValues.name.trim() !== "") || 
      (watchedValues.description && watchedValues.description.trim() !== "") || 
      (watchedValues.cronSchedule && watchedValues.cronSchedule.trim() !== "");
    
    // Form is considered changed if either fields have values or tests are selected
    setFormChanged(formHasValues || selectedTests.length > 0);
  }, [watchedValues, selectedTests]);

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
          <div>
            <CardTitle>Create New Job</CardTitle>
            <CardDescription className="mt-2">Configure a new automated job</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-6">
              {/* Main grid: Left column for Name/Desc, Right for Cron */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Name and Description */}
                <div className="space-y-4">
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
                    name="description"
                    render={({ field }: { field: ControllerRenderProps<FormData, "description"> }) => (
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
                </div>

                {/* Right Column: Cron Scheduler */}
                <div className="space-y-4"> 
                  <FormField
                    control={form.control}
                    name="cronSchedule"
                    render={({
                      field,
                    }: {
                      field: ControllerRenderProps<FormData, "cronSchedule">;
                    }) => (
                      <FormItem>
                        <FormLabel className="mb-6">
                          Cron Schedule (UTC){" "}
                          <span className="text-gray-500">(optional)</span>
                        </FormLabel>
                        <FormControl>
                          <CronScheduler 
                            value={field.value || ""}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <NextRunDisplay cronExpression={field.value} />
                        <p className="text-xs text-muted-foreground mt-4 flex items-center">
                          <Info className="h-3 w-3 mr-1" />
                          <span>Leave empty for manual execution.</span>
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

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
                  onClick={onCancel || (() => router.push("/jobs"))}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex items-center"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <SaveIcon className="h-4 w-4 mr-2" />
                  )}
                  {isSubmitting ? "Creating..." : (hideAlerts ? "Next: Alerts" : "Create")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

// Default export for backward compatibility
export default CreateJob;
