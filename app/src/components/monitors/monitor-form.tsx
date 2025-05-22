"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monitorTypes } from "./data";
import { Loader2, SaveIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Create schema for the form
const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  url: z.string().url("Please enter a valid URL"),
  method: z.enum(["ping", "get", "post", "tcp"], {
    required_error: "Please select a check type",
  }),
  interval: z.coerce.number().int().min(30).default(60),
  // Optional fields that may be required based on method
  expectedStatus: z.coerce.number().int().min(100).max(599).optional(),
  expectedResponseBody: z.string().optional(),
  port: z.coerce.number().int().optional(),
});

// Define the form values type
type FormValues = z.infer<typeof formSchema>;

interface MonitorFormProps {
  initialData?: FormValues;
  editMode?: boolean;
  id?: string;
}

export function MonitorForm({ initialData, editMode = false, id }: MonitorFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formChanged, setFormChanged] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      url: "https://",
      method: "ping",
      interval: 60,
    },
  });

  const method = form.watch("method");
  
  // Watch for form changes
  const watchedValues = form.watch();
  
  // Update formChanged state when form values change
  useState(() => {
    const hasValues = 
      (watchedValues.name && watchedValues.name.trim() !== "") || 
      (watchedValues.url && watchedValues.url !== "https://") ||
      watchedValues.method !== "ping" ||
      watchedValues.interval !== 60;
      
    setFormChanged(hasValues);
  });

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);

    try {
      // Endpoint for edit or create
      const endpoint = editMode ? `/api/monitors/${id}` : "/api/monitors";
      const method = editMode ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save monitor");
      }

      const result = await response.json();

      toast.success(
        editMode ? "Monitor updated" : "Monitor created",
        {
          description: editMode 
            ? `Monitor "${data.name}" has been updated.`
            : `Monitor "${data.name}" has been created.`,
        }
      );

      // Redirect to the monitor list or detail page
      if (editMode) {
        router.push(`/monitors/${id}`);
      } else {
        router.push(`/monitors/${result.id}`);
      }
    } catch (error) {
      console.error("Error saving monitor:", error);
      toast.error(
        editMode ? "Failed to update monitor" : "Failed to create monitor",
        {
          description: error instanceof Error ? error.message : "An unknown error occurred",
        }
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 p-8">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
          <div>
            <CardTitle>{editMode ? "Edit Monitor" : "Create New Monitor"}</CardTitle>
            <CardDescription className="mt-2">
              {editMode ? "Update monitor configuration" : "Configure a new uptime monitor"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left column */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monitor Name</FormLabel>
                        <FormControl>
                          <Input placeholder="My Website" {...field} />
                        </FormControl>
                        <FormDescription>
                          A friendly name to identify this monitor
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://example.com" 
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription>
                          The URL to monitor (e.g., https://example.com)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Check Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a check type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {monitorTypes
                              .filter(type => type.value !== "heartbeat") // Remove heartbeat option
                              .map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  <div className="flex items-center">
                                    {type.icon && (
                                      <type.icon className={`mr-2 h-4 w-4 ${type.color}`} />
                                    )}
                                    <span>{type.label}</span>
                                  </div>
                                </SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          The type of check to perform
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="interval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Check Interval (seconds)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={30}
                            placeholder="60"
                            {...field}
                            onChange={(e) => {
                              const value = parseInt(e.target.value);
                              if (!isNaN(value)) {
                                field.onChange(value);
                              } else {
                                field.onChange(60); // Default value if input is invalid
                              }
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          How often to check the URL (minimum 30 seconds)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Conditional fields based on method */}
              {(method === "get" || method === "post") && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-lg font-medium">Response Validation</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="expectedStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Status Code</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={100}
                              max={599}
                              placeholder="200"
                              {...field}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  field.onChange(value);
                                } else {
                                  field.onChange(undefined);
                                }
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            The HTTP status code you expect (e.g., 200 for OK)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expectedResponseBody"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Response (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Text that should be in the response"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription>
                            Text that should be included in the response body
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              {method === "tcp" && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-lg font-medium">TCP Settings</h3>
                  <div className="w-full md:w-1/2">
                    <FormField
                      control={form.control}
                      name="port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>TCP Port</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={65535}
                              placeholder="443"
                              {...field}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  field.onChange(value);
                                } else {
                                  field.onChange(undefined);
                                }
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            The TCP port to connect to (1-65535)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/monitors")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !formChanged}
                  className="flex items-center"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <SaveIcon className="mr-2 h-4 w-4" />
                  )}
                  {editMode ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
} 