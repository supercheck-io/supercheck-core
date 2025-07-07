"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Loader2, SaveIcon, ChevronDown, ChevronRight, Info, RefreshCw, Network, Globe, Activity, Shield, LaptopMinimal } from "lucide-react";
import { AlertSettings } from "@/components/alerts/alert-settings";

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
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

// Define presets for Expected Status Codes
const statusCodePresets = [
  { label: "Any 2xx (Success)", value: "200-299" },
  { label: "Any 3xx (Redirection)", value: "300-399" },
  { label: "Any 4xx (Client Error)", value: "400-499" },
  { label: "Any 5xx (Server Error)", value: "500-599" },
  { label: "Specific Code", value: "custom" }, // User can input custom code
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

// Create schema for the form with conditional validation
const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  target: z.string().optional(),
  type: z.enum(["http_request", "website", "ping_host", "port_check", "heartbeat"], {
    required_error: "Please select a check type",
  }),
  interval: z.enum(["60", "300", "600", "900", "1800", "3600", "10800", "43200", "86400"]).default("1800"),
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
  // Heartbeat specific
  heartbeatConfig_expectedInterval: z.coerce.number().int().min(1).max(10080).optional(), // 1 minute to 1 week
  heartbeatConfig_gracePeriod: z.coerce.number().int().min(1).max(1440).optional(), // 1 minute to 1 day
  // Website SSL checking
  websiteConfig_enableSslCheck: z.boolean().optional(),
  websiteConfig_sslDaysUntilExpirationWarning: z.coerce.number().int().min(1).max(365).optional(), // 1 day to 1 year
}).superRefine((data, ctx) => {
  // Target is required for all monitor types except heartbeat
  if (data.type !== "heartbeat" && (!data.target || data.target.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Target is required for this monitor type",
      path: ["target"],
    });
  }

  // Port is required for port_check
  if (data.type === "port_check") {
    if (!data.portConfig_port) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Port is required for port check monitors",
        path: ["portConfig_port"],
      });
    }
  }

  // Expected interval is required for heartbeat
  if (data.type === "heartbeat") {
    if (!data.heartbeatConfig_expectedInterval) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected interval is required for heartbeat monitors",
        path: ["heartbeatConfig_expectedInterval"],
      });
    }
  }
});

// Define the form values type
export type FormValues = z.infer<typeof formSchema>;

// Default values for creating a new monitor
const creationDefaultValues: FormValues = {
  name: "",
  target: "",
  type: "http_request",
  interval: "1800", // Default to 30 minutes
  httpConfig_authType: "none",
  httpConfig_method: "GET",
  httpConfig_headers: "",
  httpConfig_body: "",
  httpConfig_expectedStatusCodes: "200-299",
  httpConfig_keywordInBody: "",
  httpConfig_keywordShouldBePresent: false,
  httpConfig_authUsername: "",
  httpConfig_authPassword: "",
  httpConfig_authToken: "",
  portConfig_port: 80, // Default port instead of undefined
  portConfig_protocol: "tcp", // Default protocol instead of undefined
  heartbeatConfig_expectedInterval: 60, // Default interval instead of undefined
  heartbeatConfig_gracePeriod: 10, // Default grace period instead of undefined
  websiteConfig_enableSslCheck: false, // Default to false instead of undefined
  websiteConfig_sslDaysUntilExpirationWarning: 30, // Default to 30 days instead of undefined
};

// Add AlertConfiguration type
interface AlertConfiguration {
  enabled: boolean;
  notificationProviders: string[];
  alertOnFailure: boolean;
  alertOnRecovery?: boolean;
  alertOnSslExpiration?: boolean;
  alertOnSuccess?: boolean;
  alertOnTimeout?: boolean;
  failureThreshold: number;
  recoveryThreshold: number;
  customMessage?: string;
}

interface MonitorFormProps {
  initialData?: FormValues;
  editMode?: boolean;
  id?: string;
  hideTypeSelector?: boolean;
  monitorType?: FormValues["type"];
  title?: string;
  description?: string;
  hideAlerts?: boolean;
  onSave?: (data: any) => void;
  onCancel?: () => void;
  alertConfig?: AlertConfiguration | null; // Use proper type
}

export function MonitorForm({ 
  initialData, 
  editMode = false, 
  id, 
  hideTypeSelector = false,
  monitorType,
  title,
  description,
  hideAlerts = false,
  onSave,
  onCancel,
  alertConfig: initialAlertConfig
}: MonitorFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formChanged, setFormChanged] = useState(false);
  const [isAuthSectionOpen, setIsAuthSectionOpen] = useState(false);
  const [isKeywordSectionOpen, setIsKeywordSectionOpen] = useState(false);
  const [isCustomStatusCode, setIsCustomStatusCode] = useState(false);
  const [alertConfig, setAlertConfig] = useState(initialAlertConfig || {
    enabled: false,
    notificationProviders: [] as string[],
    alertOnFailure: true,
    alertOnRecovery: true,
    alertOnSslExpiration: false,
    failureThreshold: 1,
    recoveryThreshold: 1,
    customMessage: "" as string,
  });
  const [showAlerts, setShowAlerts] = useState(false);
  const [monitorData, setMonitorData] = useState<any>(null);

  // Get current monitor type from URL params if not provided as prop
  const urlType = searchParams.get('type') as FormValues["type"];
  const currentMonitorType = monitorType || urlType || 'http_request';

  // Create default values based on monitor type if provided
  const getDefaultValues = useCallback((): FormValues => {
    // If we have initialData (edit mode), use it
    if (initialData) {
      return initialData;
    }
    
    // Otherwise, create defaults based on current monitor type
    const typeToUse = currentMonitorType;
    if (typeToUse) {
      return {
        name: "",
        target: "",
        type: typeToUse,
        interval: "1800",
        httpConfig_authType: "none",
        httpConfig_method: "GET",
        httpConfig_headers: "",
        httpConfig_body: "",
        httpConfig_expectedStatusCodes: "200-299",
        httpConfig_keywordInBody: "",
        httpConfig_keywordShouldBePresent: false,
        httpConfig_authUsername: "",
        httpConfig_authPassword: "",
        httpConfig_authToken: "",
        portConfig_port: typeToUse === "port_check" ? 80 : 80, // Always provide default
        portConfig_protocol: typeToUse === "port_check" ? "tcp" : "tcp", // Always provide default
        heartbeatConfig_expectedInterval: typeToUse === "heartbeat" ? 60 : 60, // Always provide default
        heartbeatConfig_gracePeriod: typeToUse === "heartbeat" ? 10 : 10, // Always provide default
        websiteConfig_enableSslCheck: typeToUse === "website" ? false : false, // Always provide default
        websiteConfig_sslDaysUntilExpirationWarning: typeToUse === "website" ? 30 : 30, // Always provide default
      };
    }
    return creationDefaultValues;
  }, [currentMonitorType, initialData]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: getDefaultValues(),
  });

  const type = form.watch("type");
  const httpMethod = form.watch("httpConfig_method");
  const authType = form.watch("httpConfig_authType");

  // Reset form when URL params change (for monitor type)
  useEffect(() => {
    if (!editMode && !initialData && urlType && urlType !== type) {
      console.log("URL type changed from", type, "to", urlType);
      const newDefaults = getDefaultValues();
      
      // Reset form with new defaults
      form.reset(newDefaults);
      
      // Force update the type field
      setTimeout(() => {
        form.setValue('type', urlType, { shouldValidate: true });
      }, 0);
      
      setFormChanged(false);
    }
  }, [urlType, editMode, initialData, type, form, getDefaultValues]);
  
  const targetPlaceholders: Record<FormValues["type"], string> = {
    http_request: "e.g., https://example.com or https://api.example.com/health",
    website: "e.g., https://example.com or https://mywebsite.com",
    ping_host: "e.g., example.com or 8.8.8.8 (IP address or hostname)",
    port_check: "e.g., example.com or 192.168.1.1 (hostname or IP address)",
    heartbeat: "Unique URL will be auto-generated when monitor is saved",
  };
  
  const watchedValues = form.watch();
  
  // useEffect to update formChanged state when form values change from defaults
  useEffect(() => {
    const defaultForComparison = initialData || creationDefaultValues;
    const hasChanged = Object.keys(watchedValues).some(key => {
      // Ensure the key exists on both objects before comparison
      if (!(key in watchedValues) || !(key in defaultForComparison)) {
        return false;
      }
      const currentVal = watchedValues[key as keyof FormValues];
      const defaultVal = defaultForComparison[key as keyof FormValues];
      
      // Handle cases where one value might be undefined and the other an empty string for certain fields
      if (currentVal === undefined && defaultVal === "") return false;
      if (currentVal === "" && defaultVal === undefined) return false;

      return currentVal !== defaultVal;
    });

    // Check if alert configuration has changed
    const initialAlert = initialAlertConfig || {
      enabled: false,
      notificationProviders: [],
      alertOnFailure: true,
      alertOnRecovery: true,
      alertOnSslExpiration: false,
      failureThreshold: 1,
      recoveryThreshold: 1,
      customMessage: "",
    };

    const alertChanged = (
      alertConfig.enabled !== initialAlert.enabled ||
      JSON.stringify(alertConfig.notificationProviders?.sort()) !== JSON.stringify(initialAlert.notificationProviders?.sort()) ||
      alertConfig.alertOnFailure !== initialAlert.alertOnFailure ||
      alertConfig.alertOnRecovery !== initialAlert.alertOnRecovery ||
      alertConfig.alertOnSslExpiration !== initialAlert.alertOnSslExpiration ||
      alertConfig.failureThreshold !== initialAlert.failureThreshold ||
      alertConfig.recoveryThreshold !== initialAlert.recoveryThreshold ||
      alertConfig.customMessage !== initialAlert.customMessage
    );
    
    // For new monitors (not edit mode), consider the form changed if required fields are filled
    const isNewMonitor = !editMode && !initialData;
    const hasRequiredFields = watchedValues.name && watchedValues.name.trim() !== "" && (watchedValues.type === "heartbeat" || (watchedValues.target && watchedValues.target.trim() !== ""));
    
    const isFormReady = isNewMonitor ? hasRequiredFields : (hasChanged || alertChanged);
    
    setFormChanged(Boolean(isFormReady));
  }, [watchedValues, initialData, editMode, alertConfig, initialAlertConfig]);

  async function onSubmit(data: FormValues) {
    setIsSubmitting(true);

    // Convert form data to API format
    const apiData = {
      name: data.name,
      target: data.target || "",
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
      if (data.httpConfig_headers && data.httpConfig_headers.trim()) {
        try {
          const parsedHeaders = JSON.parse(data.httpConfig_headers);
          if (typeof parsedHeaders === 'object' && parsedHeaders !== null) {
            apiData.config.headers = parsedHeaders;
          }
        } catch (e) {
          console.warn("Failed to parse headers as JSON:", e);
          throw new Error("Headers must be valid JSON format, e.g., {\"Content-Type\": \"application/json\"}");
        }
      }

      // Add body if provided
      if (data.httpConfig_body && data.httpConfig_body.trim()) {
        apiData.config.body = data.httpConfig_body;
      }

      // Add auth if configured
      if (data.httpConfig_authType && data.httpConfig_authType !== "none") {
        if (data.httpConfig_authType === "basic") {
          if (!data.httpConfig_authUsername || !data.httpConfig_authPassword) {
            throw new Error("Username and password are required for Basic Auth");
          }
          apiData.config.auth = {
            type: "basic",
            username: data.httpConfig_authUsername,
            password: data.httpConfig_authPassword,
          };
        } else if (data.httpConfig_authType === "bearer") {
          if (!data.httpConfig_authToken) {
            throw new Error("Token is required for Bearer Auth");
          }
          apiData.config.auth = {
            type: "bearer",
            token: data.httpConfig_authToken,
          };
        }
      }

      // Add keyword checking if configured, or explicitly remove if empty
      if (data.httpConfig_keywordInBody && data.httpConfig_keywordInBody.trim()) {
        apiData.config.keywordInBody = data.httpConfig_keywordInBody;
        apiData.config.keywordInBodyShouldBePresent = data.httpConfig_keywordShouldBePresent !== false;
      } else {
        // Explicitly remove keyword validation if field is empty
        delete apiData.config.keywordInBody;
        delete apiData.config.keywordInBodyShouldBePresent;
      }
    } else if (data.type === "website") {
      // Website monitoring is essentially HTTP GET with simplified config
      apiData.config = {
        method: "GET",
        expectedStatusCodes: data.httpConfig_expectedStatusCodes || "200-299",
        timeoutSeconds: 30, // Default timeout
      };

      // Add auth if configured
      if (data.httpConfig_authType && data.httpConfig_authType !== "none") {
        if (data.httpConfig_authType === "basic") {
          if (!data.httpConfig_authUsername || !data.httpConfig_authPassword) {
            throw new Error("Username and password are required for Basic Auth");
          }
          apiData.config.auth = {
            type: "basic",
            username: data.httpConfig_authUsername,
            password: data.httpConfig_authPassword,
          };
        } else if (data.httpConfig_authType === "bearer") {
          if (!data.httpConfig_authToken) {
            throw new Error("Token is required for Bearer Auth");
          }
          apiData.config.auth = {
            type: "bearer",
            token: data.httpConfig_authToken,
          };
        }
      }

      // Add keyword checking if configured
      if (data.httpConfig_keywordInBody && data.httpConfig_keywordInBody.trim()) {
        apiData.config.keywordInBody = data.httpConfig_keywordInBody;
        apiData.config.keywordInBodyShouldBePresent = data.httpConfig_keywordShouldBePresent !== false;
      } else {
        // Explicitly remove keyword validation if field is empty
        delete apiData.config.keywordInBody;
        delete apiData.config.keywordInBodyShouldBePresent;
      }

      // Add SSL checking if enabled
      if (data.websiteConfig_enableSslCheck) {
        apiData.config.enableSslCheck = true;
        apiData.config.sslDaysUntilExpirationWarning = data.websiteConfig_sslDaysUntilExpirationWarning || 30;
      }
    } else if (data.type === "port_check") {
      apiData.config = {
        port: data.portConfig_port,
        protocol: data.portConfig_protocol || "tcp",
        timeoutSeconds: 10, // Default timeout for port checks
      };
    } else if (data.type === "ping_host") {
      apiData.config = {
        timeoutSeconds: 5, // Default timeout for ping
      };
    } else if (data.type === "heartbeat") {
      // Generate unique heartbeat token for new monitors, keep existing for edits
      const heartbeatToken = editMode && data.target ? data.target : crypto.randomUUID();
      
      // For heartbeat monitors, target is the unique token
      apiData.target = heartbeatToken;
      
      // Heartbeat monitors use check interval to detect missed pings
      // This should be more frequent than the expected ping interval
      apiData.frequencyMinutes = Math.round(parseInt(data.interval, 10) / 60);
      
      apiData.config = {
        expectedIntervalMinutes: data.heartbeatConfig_expectedInterval || 60,
        gracePeriodMinutes: data.heartbeatConfig_gracePeriod || 10,
        heartbeatUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/heartbeat/${heartbeatToken}`,
        // Add check type to distinguish heartbeat checking logic
        checkType: 'heartbeat_missed_ping',
      };
    }

    try {
      // If onSave callback is provided (wizard mode), pass the processed API data
      if (onSave) {
        onSave(apiData); // Pass processed API data with all required fields
        setIsSubmitting(false);
        return;
      }

      // If edit mode and alerts not hidden, show alerts step
      if (editMode && !hideAlerts) {
        setMonitorData(apiData);
        setShowAlerts(true);
        setIsSubmitting(false);
        return;
      }

      // Direct save mode (creation or edit without alerts)
      await handleDirectSave(apiData);
    } catch (error) {
      console.error("Error processing monitor:", error);
      toast.error(
        editMode ? "Failed to update monitor" : "Failed to create monitor",
        {
          description: error instanceof Error ? error.message : "An unknown error occurred",
        }
      );
      setIsSubmitting(false);
    }
  }

  async function handleDirectSave(apiData: any, includeAlerts = false) {
    setIsSubmitting(true);
    
    try {
      const saveData = includeAlerts ? { ...apiData, alertConfig } : apiData;
      const endpoint = editMode ? `/api/monitors/${id}` : "/api/monitors";
      const method = editMode ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(saveData),
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
            ? `Monitor "${apiData.name}" has been updated.`
            : `Monitor "${apiData.name}" has been created.`,
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

  async function handleFinalSubmit() {
    if (monitorData) {
      await handleDirectSave(monitorData, true);
    }
  }

  if (showAlerts) {
    return (
      <div className="space-y-4 p-4 min-h-[calc(100vh-8rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Alert Settings <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span></CardTitle>
            <CardDescription>
              Configure alert notifications for this monitor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AlertSettings
              value={alertConfig}
              onChange={(config) => setAlertConfig({
                enabled: config.enabled,
                notificationProviders: config.notificationProviders,
                alertOnFailure: config.alertOnFailure,
                alertOnRecovery: config.alertOnRecovery || false,
                alertOnSslExpiration: config.alertOnSslExpiration || false,
                failureThreshold: config.failureThreshold,
                recoveryThreshold: config.recoveryThreshold,
                customMessage: config.customMessage || "",
              })}
              context="monitor"
              monitorType={type}
            />
            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAlerts(false)}
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button 
                onClick={handleFinalSubmit}
                disabled={isSubmitting || !formChanged}
                className="flex items-center"
              >
                <SaveIcon className="mr-2 h-4 w-4" />
                {isSubmitting ? "Updating..." : "Update Monitor"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 min-h-[calc(100vh-8rem)]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <div className="flex items-center gap-2">
              {monitorTypes.map((type) => ( 
                monitorType === type.value && (
                  <type.icon className={`h-6 w-6 ${type.color} mt-0.5 flex-shrink-0`} key={type.value} />
                )
              ))}
              <CardTitle className="text-2xl font-semibold">{title || (editMode ? "Edit Monitor" : "Create Monitor")}</CardTitle>
              {hideTypeSelector && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96 mt-2" side="right" sideOffset={8}>
                    <div>
                      <h4 className="font-semibold text-sm mb-3 text-foreground">Monitor Types</h4>
                      <div className="space-y-3">
                        {monitorTypes.map((type) => (
                          <div key={type.value} className="flex items-start space-x-3 p-2 rounded-md bg-muted/30">
                            {type.icon && (
                              <type.icon className={`h-4 w-4 ${type.color} mt-0.5 flex-shrink-0`} />
                            )}
                            <div>
                              <p className="font-medium text-sm">{type.label}</p>
                              <p className="text-xs text-muted-foreground">{type.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <CardDescription className="mt-1">
              {description || (editMode ? "Update monitor configuration" : "Configure a new uptime monitor")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                  {/* Target field - always visible now */}
                  <FormField
                    control={form.control}
                    name="target"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={type ? targetPlaceholders[type] : "Select Check Type for target hint"}
                            disabled={type === "heartbeat"}
                            {...field} 
                          />
                        </FormControl>
                        {/* {type === "heartbeat" && (
                          <FormDescription>
                            A unique heartbeat token will be auto-generated
                          </FormDescription>
                        )} */}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  {!hideTypeSelector && (
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center">
                            <FormLabel>Check Type</FormLabel>
                            <TooltipProvider>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="ml-2 h-6 w-6 p-0">
                                  <Info className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-96 p-0" side="right" sideOffset={8}>
                                <div className="p-4">
                                  <h4 className="font-semibold text-sm mb-3 text-foreground">Monitor Types</h4>
                                                                     <div className="space-y-3">
                                     <div className="flex items-start space-x-3 p-2 rounded-md bg-muted/30">
                                       <Globe className="h-4 w-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                                       <div>
                                         <p className="font-medium text-sm">HTTP Monitor</p>
                                         <p className="text-xs text-muted-foreground">Monitors web pages and API endpoints for availability, status codes, and response content validation.</p>
                                       </div>
                                     </div>
                                     <div className="flex items-start space-x-3 p-2 rounded-md bg-muted/30">
                                       <LaptopMinimal className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                       <div>
                                         <p className="font-medium text-sm">Website Monitor</p>
                                         <p className="text-xs text-muted-foreground">Simple website monitoring with GET requests to check availability and response times.</p>
                                       </div>
                                     </div>
                                     <div className="flex items-start space-x-3 p-2 rounded-md bg-muted/30">
                                       <RefreshCw className="h-4 w-4 text-sky-500 mt-0.5 flex-shrink-0" />
                                       <div>
                                         <p className="font-medium text-sm">Ping Monitor</p>
                                         <p className="text-xs text-muted-foreground">Sends ICMP ping packets to verify basic network connectivity and measure response times.</p>
                                       </div>
                                     </div>
                                     <div className="flex items-start space-x-3 p-2 rounded-md bg-muted/30">
                                       <Network className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />
                                       <div>
                                         <p className="font-medium text-sm">Port Monitor</p>
                                         <p className="text-xs text-muted-foreground">Tests TCP/UDP port availability and connectivity to ensure services are accessible.</p>
                                       </div>
                                     </div>
                                     <div className="flex items-start space-x-3 p-2 rounded-md bg-muted/30">
                                       <Activity className="h-4 w-4 text-blue-300 mt-0.5 flex-shrink-0" />
                                       <div>
                                         <p className="font-medium text-sm">Heartbeat Monitor</p>
                                         <p className="text-xs text-muted-foreground">Passive monitoring that expects regular pings from your services, scripts, or cron jobs.</p>
                                       </div>
                                     </div>
                                   </div>
                                </div>
                              </PopoverContent>
                            </Popover>
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
                  )}

                  {/* Interval field - heartbeat monitors use this for checking missed pings */}
                  <FormField
                    control={form.control}
                    name="interval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {type === "heartbeat" ? "Check for Missed Pings" : "Check Interval"}
                        </FormLabel>
                        <div className="md:w-40">
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
                        <FormDescription>
                          {type === "heartbeat" 
                            ? "How often to check for missed pings (should be more frequent than expected interval)"
                            : "How often to run the check"
                          }
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Show note for heartbeat monitors */}
                  {/* {type === "heartbeat" && (
                    <div className="border border-light-200 rounded-lg p-3">
                      <div className="flex items-center space-x-2">
                        <Activity className="h-4 w-4 text-blue-300" />
                        <span className="text-sm font-medium">Heartbeat Monitoring</span>
                      </div>
                      <p className="text-xs">
                        Heartbeat monitors check for missed pings from your services. Set check interval shorter than expected ping interval.
                      </p>
                    </div>
                  )} */}
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
                      render={({ field }) => {
                        const presetValues = ["200-299", "300-399", "400-499", "500-599"];
                        const currentValue = field.value || "200-299";
                        
                        // Determine if current value is a preset or custom
                        const isCurrentValuePreset = presetValues.includes(currentValue);
                        
                        const handleDropdownChange = (value: string) => {
                          if (value === "custom") {
                            setIsCustomStatusCode(true);
                            field.onChange("");
                          } else {
                            setIsCustomStatusCode(false);
                            field.onChange(value);
                          }
                        };

                        const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                          field.onChange(e.target.value);
                          if (e.target.value && !isCustomStatusCode) {
                            setIsCustomStatusCode(true);
                          }
                        };

                        // Determine dropdown value - sync with actual field value
                        const dropdownValue = isCustomStatusCode ? "custom" : (isCurrentValuePreset ? currentValue : "200-299");
                        
                        return (
                          <FormItem>
                            <FormLabel>Expected Status Codes</FormLabel>
                            <div className="flex items-center space-x-2">
                              <FormControl className="flex-grow">
                                <Input 
                                  placeholder="e.g., 200, 404, 500-599"
                                  value={isCustomStatusCode ? currentValue : (isCurrentValuePreset ? currentValue : "")} 
                                  onChange={handleInputChange}
                                  disabled={!isCustomStatusCode}
                                  className={!isCustomStatusCode ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              <Select
                                value={dropdownValue}
                                onValueChange={handleDropdownChange}
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {statusCodePresets.map((preset) => (
                                    <SelectItem key={preset.value} value={preset.value}>
                                      {preset.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <FormDescription>
                              {isCustomStatusCode ? "Enter specific status codes (e.g., 200, 404, 500-599)" : "Select 'Specific Code' to enter custom codes"}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
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

                  {/* Authentication and Response Content Validation sections side by side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    {/* Authentication Section */}
                    <Card>
                      <Collapsible open={isAuthSectionOpen} onOpenChange={setIsAuthSectionOpen}>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                            <div className="flex items-center space-x-2">
                              {isAuthSectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <CardTitle className="text-base">Authentication</CardTitle>
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Optional</span>
                            </div>
                            <CardDescription className="text-sm">
                              Configure authentication credentials for protected endpoints
                            </CardDescription>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-4">
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
                          <div className="space-y-4 mb-4">
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
                          <div className="mb-4">
                            <FormField
                              control={form.control}
                              name="httpConfig_authToken"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Bearer Token</FormLabel>
                                  <FormControl>
                                    <Input type="password" placeholder="Enter bearer token" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}

                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>

                    {/* Response Content Validation Section */}
                    <Card>
                      <Collapsible open={isKeywordSectionOpen} onOpenChange={setIsKeywordSectionOpen}>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                            <div className="flex items-center space-x-2">
                              {isKeywordSectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <CardTitle className="text-base">Response Content Validation</CardTitle>
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Optional</span>
                            </div>
                            <CardDescription className="text-sm">
                              Validate response content by checking for specific keywords or text
                            </CardDescription>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-4">
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
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  </div>
                </div>
              )}

              {type === "website" && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-base font-medium">Website Check Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Expected Status Code */}
                    <FormField
                      control={form.control}
                      name="httpConfig_expectedStatusCodes" 
                      render={({ field }) => {
                        const presetValues = ["200-299", "300-399", "400-499", "500-599"];
                        const currentValue = field.value || "200-299";
                        
                        // Determine if current value is a preset or custom
                        const isCurrentValuePreset = presetValues.includes(currentValue);
                        
                        const handleDropdownChange = (value: string) => {
                          if (value === "custom") {
                            setIsCustomStatusCode(true);
                            field.onChange("");
                          } else {
                            setIsCustomStatusCode(false);
                            field.onChange(value);
                          }
                        };

                        const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                          field.onChange(e.target.value);
                          if (e.target.value && !isCustomStatusCode) {
                            setIsCustomStatusCode(true);
                          }
                        };

                        // Determine dropdown value - sync with actual field value
                        const dropdownValue = isCustomStatusCode ? "custom" : (isCurrentValuePreset ? currentValue : "200-299");
                        
                        return (
                          <FormItem>
                            <FormLabel>Expected Status Codes</FormLabel>
                            <div className="flex items-center space-x-2">
                              <FormControl className="flex-grow">
                                <Input 
                                  placeholder="e.g., 200, 404, 500-599"
                                  value={isCustomStatusCode ? currentValue : (isCurrentValuePreset ? currentValue : "")} 
                                  onChange={handleInputChange}
                                  disabled={!isCustomStatusCode}
                                  className={!isCustomStatusCode ? "bg-muted cursor-not-allowed" : ""}
                                />
                              </FormControl>
                              <Select
                                value={dropdownValue}
                                onValueChange={handleDropdownChange}
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {statusCodePresets.map((preset) => (
                                    <SelectItem key={preset.value} value={preset.value}>
                                      {preset.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <FormDescription>
                              {isCustomStatusCode ? "Enter specific status codes (e.g., 200, 404, 500-599)" : "Select 'Specific Code' to enter custom codes"}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />

                    {/* SSL Certificate Check Section - Compact and Inline for Website */}
                    <div className="p-3 border rounded-lg bg-muted/10">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Shield className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">SSL Check</span>
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                          </div>
                          
                          <FormField
                            control={form.control}
                            name="websiteConfig_enableSslCheck"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        {form.watch("websiteConfig_enableSslCheck") && (
                          <div className="flex items-center space-x-2 pt-2 border-t">
                            <span className="text-xs text-muted-foreground">Alert in</span>
                            <FormField
                              control={form.control}
                              name="websiteConfig_sslDaysUntilExpirationWarning"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="30"
                                      min="1"
                                      max="365"
                                      className="w-16 h-7 text-xs"
                                      {...field}
                                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <span className="text-xs text-muted-foreground">days</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Authentication and Content Validation sections side by side for Website */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                    {/* Authentication Section */}
                    <Card>
                      <Collapsible open={isAuthSectionOpen} onOpenChange={setIsAuthSectionOpen}>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                            <div className="flex items-center space-x-2">
                              {isAuthSectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <CardTitle className="text-base">Authentication</CardTitle>
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Optional</span>
                            </div>
                            <CardDescription className="text-sm">
                              Configure authentication credentials for protected websites
                            </CardDescription>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-4">
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
                          <div className="space-y-4 mb-4">
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
                          <div className="mb-4">
                            <FormField
                              control={form.control}
                              name="httpConfig_authToken"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Bearer Token</FormLabel>
                                  <FormControl>
                                    <Input type="password" placeholder="Enter bearer token" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}

                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>

                    {/* Content Validation Section */}
                    <Card>
                      <Collapsible open={isKeywordSectionOpen} onOpenChange={setIsKeywordSectionOpen}>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-2">
                            <div className="flex items-center space-x-2">
                              {isKeywordSectionOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              <CardTitle className="text-base">Content Validation</CardTitle>
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Optional</span>
                            </div>
                            <CardDescription className="text-sm">
                              Check if specific text or keywords exist on your website
                            </CardDescription>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-4">
                        <FormField
                          control={form.control}
                          name="httpConfig_keywordInBody"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Keyword</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Welcome"
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
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  </div>


                </div>
              )}

              {type === "heartbeat" && (
                <div className="space-y-4 border-t pt-6">
                  <h3 className="text-lg font-medium">Heartbeat Settings</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="heartbeatConfig_expectedInterval"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Expected Interval (minutes)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={10080}
                              placeholder="60"
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
                            How often you expect to receive a ping (1-10080 minutes)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="heartbeatConfig_gracePeriod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Grace Period (minutes)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={1440}
                              placeholder="10"
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
                            Additional time to wait before marking as down (1-1440 minutes)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="bg-muted/30 p-4 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">How to use this heartbeat:</h4>
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>1. Create this monitor to get a unique heartbeat URL</p>
                      <p>2. Send GET or POST requests to the URL from your service/script</p>
                      <p>3. If no ping is received within the expected interval + grace period, the monitor will be marked as down</p>
                      <p className="font-medium">Example: <code className="bg-background px-1 rounded">curl https://yourapp.com/api/heartbeat/YOUR_TOKEN</code></p>
                    </div>
                  </div>
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
                  onClick={onCancel || (() => router.push("/monitors"))}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="flex items-center"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <SaveIcon className="mr-2 h-4 w-4" />
                  )}
                  {hideAlerts ? "Next: Alerts" : (editMode ? "Next: Alerts" : "Create")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
} 