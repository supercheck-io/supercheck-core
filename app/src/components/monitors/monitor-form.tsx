"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, Resolver } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monitorTypes } from "./data";
import { Loader2, SaveIcon, ChevronDown, ChevronRight, Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Define common HTTP status codes for selection
const commonHttpStatusCodes = [
  { code: 200, label: "200 OK" },
  { code: 201, label: "201 Created" },
  { code: 204, label: "204 No Content" },
  { code: 301, label: "301 Moved Permanently" },
  { code: 302, label: "302 Found" },
  { code: 400, label: "400 Bad Request" },
  { code: 401, label: "401 Unauthorized" },
  { code: 403, label: "403 Forbidden" },
  { code: 404, label: "404 Not Found" },
  { code: 500, label: "500 Internal Server Error" },
  { code: 502, label: "502 Bad Gateway" },
  { code: 503, label: "503 Service Unavailable" },
  { code: 504, label: "504 Gateway Timeout" },
];

// Define presets for Expected Status Codes
const statusCodePresets = [
  { label: "Any 2xx (Success)", value: "200-299" },
  { label: "Any 3xx (Redirection)", value: "300-399" },
  { label: "Any 4xx (Client Error)", value: "400-499" },
  { label: "Any 5xx (Server Error)", value: "500-599" },
  { label: "Specific Code (e.g., 200)", value: "200" }, // User can modify after selection
  { label: "Common Web (2xx, 3xx)", value: "200-399" },
];

const checkIntervalOptions = [
  { value: "60", label: "1 minute" },
  { value: "300", label: "5 minutes" },
  { value: "600", label: "10 minutes" },
  { value: "900", label: "15 minutes" },
  { value: "1800", label: "30 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "10800", label: "3 hours" },
  { value: "43200", label: "12 hours" },
  { value: "86400", label: "24 hours" },
];

// Create schema for the form
const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  target: z.string().min(1, "Target is required"),
  type: z.enum(["http_request", "ping_host", "port_check", "playwright_script"], {
    required_error: "Please select a check type",
  }),
  interval: z.enum(["60", "300", "600", "900", "1800", "3600", "10800", "43200", "86400"]).default("60"),
  // Optional fields that may be required based on type
  // HTTP Request specific
  httpConfig_method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]).optional(),
  httpConfig_headers: z.string().optional(),
  httpConfig_body: z.string().optional(),
  httpConfig_expectedStatusCodes: z.string().optional(),
  httpConfig_keywordInBody: z.string().optional(),
  httpConfig_keywordShouldBePresent: z.boolean().optional(),
  // Auth fields for HTTP Request
  httpConfig_authType: z.enum(["none", "basic", "bearer"]).optional().default("none"),
  httpConfig_authUsername: z.string().optional(),
  httpConfig_authPassword: z.string().optional(),
  httpConfig_authToken: z.string().optional(),
  // Port Check specific
  portConfig_port: z.coerce.number().int().min(1).max(65535).optional(),
  portConfig_protocol: z.enum(["tcp", "udp"]).optional(),
  // Playwright Script specific
  playwrightConfig_testId: z.string().uuid().optional(),
});

// Define the form values type
export type FormValues = z.infer<typeof formSchema>;

// Default values for creating a new monitor
const creationDefaultValues: FormValues = {
  name: "",
  target: "", // Or a more sensible default like "https://"
  type: "http_request", // Default to the first option or a common one
  interval: "60", // Default to 1 minute (string value for enum)
  httpConfig_authType: "none",
  // Initialize other optional fields to undefined or their sensible defaults if necessary
  httpConfig_method: "GET",
  httpConfig_headers: undefined,
  httpConfig_body: undefined,
  httpConfig_expectedStatusCodes: "200-299",
  httpConfig_keywordInBody: undefined,
  httpConfig_keywordShouldBePresent: undefined,
  httpConfig_authUsername: undefined,
  httpConfig_authPassword: undefined,
  httpConfig_authToken: undefined,
  portConfig_port: undefined,
  portConfig_protocol: undefined,
  playwrightConfig_testId: undefined,
};

interface MonitorFormProps {
  initialData?: FormValues;
  editMode?: boolean;
  id?: string;
}

export function MonitorForm({ initialData, editMode = false, id }: MonitorFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formChanged, setFormChanged] = useState(false);
  const [isAuthSectionOpen, setIsAuthSectionOpen] = useState(false);
  const [isKeywordSectionOpen, setIsKeywordSectionOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: initialData || creationDefaultValues,
  });

  const type = form.watch("type");
  const httpMethod = form.watch("httpConfig_method");
  const authType = form.watch("httpConfig_authType");
  
  const targetPlaceholders: Record<FormValues["type"], string> = {
    http_request: "e.g., https://example.com or https://api.example.com/health",
    ping_host: "e.g., example.com or 8.8.8.8 (IP address or hostname)",
    port_check: "e.g., example.com or 192.168.1.1 (hostname or IP address)",
    playwright_script: "Optional - leave blank if test configuration handles target",
  };
  
  const watchedValues = form.watch();
  
  // useEffect to update formChanged state when form values change from defaults
  useEffect(() => {
    const defaultForComparison = initialData || creationDefaultValues;
    const hasChanged = Object.keys(watchedValues).some(key => {
      // Ensure the key exists on both objects before comparison
      if (!(key in watchedValues) || !(key in defaultForComparison)) {
        return false; // Or handle as per your logic if a key might be missing
      }
      const currentVal = watchedValues[key as keyof FormValues];
      const defaultVal = defaultForComparison[key as keyof FormValues];
      
      // Handle cases where one value might be undefined and the other an empty string for certain fields
      if (currentVal === undefined && defaultVal === "") return false;
      if (currentVal === "" && defaultVal === undefined) return false;

      return currentVal !== defaultVal;
    });
    setFormChanged(hasChanged);
  }, [watchedValues, initialData, creationDefaultValues]); // Add creationDefaultValues to dependency array

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);

    // Convert form data to API format
    const apiData = {
      name: data.name,
      target: data.target,
      type: data.type,
      // Convert interval from seconds to minutes
      frequencyMinutes: Math.round(parseInt(data.interval, 10) / 60),
      config: {} as any,
    };

    // Build config based on monitor type
    if (data.type === "http_request") {
      apiData.config = {
        method: data.httpConfig_method || "GET",
        expectedStatusCodes: data.httpConfig_expectedStatusCodes || "200-299",
        timeoutSeconds: 30, // Default timeout
      };

      // Add headers if provided
      if (data.httpConfig_headers) {
        try {
          apiData.config.headers = JSON.parse(data.httpConfig_headers);
        } catch (e) {
          // If parsing fails, treat as plain text (could be improved)
          console.warn("Failed to parse headers as JSON:", e);
        }
      }

      // Add body if provided
      if (data.httpConfig_body) {
        apiData.config.body = data.httpConfig_body;
      }

      // Add auth if configured
      if (data.httpConfig_authType && data.httpConfig_authType !== "none") {
        apiData.config.auth = {
          type: data.httpConfig_authType,
        };
        if (data.httpConfig_authType === "basic") {
          apiData.config.auth.username = data.httpConfig_authUsername;
          apiData.config.auth.password = data.httpConfig_authPassword;
        } else if (data.httpConfig_authType === "bearer") {
          apiData.config.auth.token = data.httpConfig_authToken;
        }
      }

      // Add keyword checking if configured
      if (data.httpConfig_keywordInBody) {
        apiData.config.keywordInBody = data.httpConfig_keywordInBody;
        apiData.config.keywordInBodyShouldBePresent = data.httpConfig_keywordShouldBePresent !== false;
      }
    } else if (data.type === "port_check") {
      apiData.config = {
        port: data.portConfig_port,
        protocol: data.portConfig_protocol || "tcp",
        timeoutSeconds: 10, // Default timeout for port checks
      };
    } else if (data.type === "playwright_script") {
      apiData.config = {
        testId: data.playwrightConfig_testId,
        timeoutSeconds: 60, // Default timeout for Playwright scripts
      };
    } else if (data.type === "ping_host") {
      apiData.config = {
        timeoutSeconds: 5, // Default timeout for ping
      };
    }

    try {
      const endpoint = editMode ? `/api/monitors/${id}` : "/api/monitors";
      const method = editMode ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiData),
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
    <div className="space-y-4 p-4">
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Conditionally render Test ID field for Playwright Script BELOW Name */}
                  {type === "playwright_script" && (
                    <FormField
                      control={form.control}
                      name="playwrightConfig_testId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Test ID</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter the test ID"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            ID of the Playwright test to run
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Conditionally render Target field */}
                  {type !== "playwright_script" && (
                    <FormField
                      control={form.control}
                      name="target"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder={type ? targetPlaceholders[type] : "Select Check Type for target hint"}
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {/* End Conditional Target Field */}
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center">
                          <FormLabel>Check Type</FormLabel>
                          <TooltipProvider>
                            <Tooltip delayDuration={300}> 
                              <TooltipTrigger asChild>
                                <Info className="ml-2 h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent 
                                side="right" 
                                className="max-w-md bg-muted text-muted-foreground border-border" 
                                sideOffset={16}
                              >
                                <div className="p-2 text-sm">
                                  <p className="font-semibold mb-1">Monitor Types:</p>
                                  <ul className="space-y-1 text-xs">
                                    <li>
                                      <strong>HTTP Request:</strong><br />
                                      <span>Checks web pages or API endpoints for availability, status code, and optionally content or JSON values.</span>
                                    </li>
                                    <li>
                                      <strong>Ping Host:</strong><br />
                                      <span>Sends an ICMP ping to a server to verify basic network connectivity and reachability.</span>
                                    </li>
                                    <li>
                                      <strong>Port Check:</strong><br />
                                      <span>Tests if a specific TCP or UDP port is open and listening on a target server.</span>
                                    </li>
                                    <li>
                                      <strong>Playwright Script:</strong><br />
                                      <span>Runs a pre-defined Playwright browser automation script to simulate user flows and test complex interactions.</span>
                                    </li>
                                  </ul>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
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
                              .map((monitorType) => (
                                <SelectItem key={monitorType.value} value={monitorType.value}>
                                  <div className="flex items-center">
                                    {monitorType.icon && (
                                      <monitorType.icon className={`mr-2 h-4 w-4 ${monitorType.color}`} />
                                    )}
                                    <span>{monitorType.label}</span>
                                  </div>
                                </SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Interval field back to its original position */}
                  <FormField
                    control={form.control}
                    name="interval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Check Interval</FormLabel>
                        <div className="md:w-40"> {/* Adjusted width for Select */}
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select interval" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {checkIntervalOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Conditional fields based on type (formerly method) */}
              {type === "http_request" && (
                <div className="space-y-4 border-t pt-6">
                  <h3 className="text-lg font-medium">HTTP Request Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="httpConfig_method"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>HTTP Method</FormLabel>
                          <FormControl>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a method" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].map((method) => (
                                  <SelectItem key={method} value={method}>
                                    <div className="flex items-center">
                                      <span>{method}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Expected Status Code */}
                    <FormField
                      control={form.control}
                      name="httpConfig_expectedStatusCodes" 
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Status Codes</FormLabel>
                          <div className="flex items-center space-x-2">
                            <FormControl className="flex-grow">
                              <Input 
                                placeholder="e.g., 200-299, 404"
                                {...field}
                                value={field.value || ""} 
                              />
                            </FormControl>
                            <Select
                              onValueChange={(presetValue) => {
                                form.setValue("httpConfig_expectedStatusCodes", presetValue, { shouldValidate: true, shouldDirty: true });
                              }}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Presets..." />
                              </SelectTrigger>
                              <SelectContent>
                                {statusCodePresets.map((preset) => (
                                  <SelectItem key={preset.label} value={preset.value}>
                                    {preset.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <FormDescription>
                            Specify codes (e.g., 200, 200-299, 404). Default is "200-299".
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="httpConfig_headers"
                      render={({ field }) => (
                        <FormItem className={`${(httpMethod === "POST" || httpMethod === "PUT" || httpMethod === "PATCH") ? '' : 'md:col-span-2'}`}>
                          <FormLabel>HTTP Headers</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder='{ "Authorization": "Bearer ..." }'
                              {...field}
                              rows={3}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {(httpMethod === "POST" || httpMethod === "PUT" || httpMethod === "PATCH") && (
                      <FormField
                        control={form.control}
                        name="httpConfig_body"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>HTTP Body</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder='Request body (e.g., JSON)'
                                {...field}
                                rows={3}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {/* Collapsible Authentication Section */}
                  <Collapsible open={isAuthSectionOpen} onOpenChange={setIsAuthSectionOpen} className="pt-4 border-t mt-4">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center space-x-2 cursor-pointer py-2">
                        {isAuthSectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <h4 className="text-md font-medium">Authentication (Optional)</h4>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-3 pl-6">
                      <FormField
                        control={form.control}
                        name="httpConfig_authType"
                        render={({ field }) => (
                          <FormItem className="mb-4">
                            <FormLabel>Authentication Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value || "none"}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select authentication type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="basic">Basic Auth</SelectItem>
                                <SelectItem value="bearer">Bearer Token</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {authType === "basic" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                          <FormField
                            control={form.control}
                            name="httpConfig_authUsername"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Username</FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter username" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="httpConfig_authPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Password</FormLabel>
                                <FormControl>
                                  <Input type="password" placeholder="Enter password" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {authType === "bearer" && (
                        <FormField
                          control={form.control}
                          name="httpConfig_authToken"
                          render={({ field }) => (
                            <FormItem className="mb-4">
                              <FormLabel>Bearer Token</FormLabel>
                              <FormControl>
                                <Textarea placeholder="Enter Bearer Token" {...field} rows={3} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                  {/* End Collapsible Authentication Section */}

                  {/* Collapsible Keyword Check Section */}
                  <Collapsible open={isKeywordSectionOpen} onOpenChange={setIsKeywordSectionOpen} className="pt-4 border-t mt-4">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center space-x-2 cursor-pointer py-2">
                        {isKeywordSectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <h4 className="text-md font-medium">Response Body Keyword Check (Optional)</h4>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2 space-y-3 pl-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="httpConfig_keywordInBody"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Keyword</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="success"
                                  {...field}
                                  value={field.value || ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="httpConfig_keywordShouldBePresent"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Keyword Should Be</FormLabel>
                              <FormControl>
                                <Select
                                  onValueChange={(value) => field.onChange(value === "true" ? true : value === "false" ? false : undefined)}
                                  defaultValue={typeof field.value === 'boolean' ? field.value.toString() : undefined}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Present or Absent?" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="true">Present</SelectItem>
                                    <SelectItem value="false">Absent</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  {/* End Collapsible Keyword Check Section */}
                </div>
              )}

              {type === "port_check" && (
                <div className="space-y-4 border-t pt-6">
                  <h3 className="text-lg font-medium">Port Check Settings</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="portConfig_port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Port</FormLabel>
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="portConfig_protocol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Protocol</FormLabel>
                          <FormControl>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a protocol" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {["tcp", "udp"].map((protocol) => (
                                  <SelectItem key={protocol} value={protocol}>
                                    <div className="flex items-center">
                                      <span>{protocol.toUpperCase()}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
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