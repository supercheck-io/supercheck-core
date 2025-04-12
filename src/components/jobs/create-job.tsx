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

const jobFormSchema = z.object({
  name: z.string().min(1, "Job name is required"),
  description: z.string().min(1, "Job description is required"),
  cronSchedule: z.string().optional(),
});

type FormData = z.infer<typeof jobFormSchema>;

export default function CreateJob() {
  const router = useRouter();
  const [selectedTests, setSelectedTests] = useState<Test[]>([]);
  const [submissionAttempted, setSubmissionAttempted] = useState(false);
  const [formChanged, setFormChanged] = useState(false);

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
    <div className="space-y-4 p-8">
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
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex items-center"
                  disabled={!formChanged}
                >
                  <SaveIcon className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
