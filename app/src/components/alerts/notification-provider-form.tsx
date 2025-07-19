"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const notificationProviderSchema = z.object({
  type: z.enum(["email", "slack", "webhook", "telegram", "discord"]),
  config: z.object({
    name: z.string().min(1, "Name is required"),
    
    // Email fields
    smtpHost: z.string().optional(),
    smtpPort: z.number().optional(),
    smtpUser: z.string().optional(),
    smtpPassword: z.string().optional(),
    smtpSecure: z.boolean().optional(),
    fromEmail: z.string().optional(),
    toEmail: z.string().optional(),
    
    // Slack fields
    webhookUrl: z.string().optional(),
    channel: z.string().optional(),
    
    // Webhook fields
    url: z.string().optional(),
    method: z.enum(["GET", "POST", "PUT"]).optional(),
    headers: z.record(z.string()).optional(),
    bodyTemplate: z.string().optional(),
    
    // Telegram fields
    botToken: z.string().optional(),
    chatId: z.string().optional(),
    
    // Discord fields
    discordWebhookUrl: z.string().optional(),
  }),
}).refine((data) => {
  // Validate required fields based on type
  if (data.type === "email") {
    return data.config.smtpHost && data.config.toEmail;
  }
  if (data.type === "slack") {
    return data.config.webhookUrl;
  }
  if (data.type === "webhook") {
    return data.config.url;
  }
  if (data.type === "telegram") {
    return data.config.botToken && data.config.chatId;
  }
  if (data.type === "discord") {
    return data.config.discordWebhookUrl;
  }
  return true;
}, {
  message: "Required fields are missing for the selected provider type",
});

type FormValues = z.infer<typeof notificationProviderSchema>;

interface NotificationProviderFormProps {
  onSuccess?: (data: FormValues) => void;
  onCancel?: () => void;
  initialData?: any;
}

export function NotificationProviderForm({ onSuccess, onCancel, initialData }: NotificationProviderFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(notificationProviderSchema),
    defaultValues: initialData ? {
      type: initialData.type,
      config: {
        name: initialData.config.name || "",
        smtpHost: initialData.config.smtpHost || "",
        smtpPort: initialData.config.smtpPort || 587,
        smtpUser: initialData.config.smtpUser || "",
        smtpPassword: initialData.config.smtpPassword || "",
        smtpSecure: initialData.config.smtpSecure || false,
        fromEmail: initialData.config.fromEmail || "",
        toEmail: initialData.config.toEmail || "",
        webhookUrl: initialData.config.webhookUrl || "",
        channel: initialData.config.channel || "",
        url: initialData.config.url || "",
        method: initialData.config.method || "POST",
        headers: initialData.config.headers || {},
        bodyTemplate: initialData.config.bodyTemplate || "",
        botToken: initialData.config.botToken || "",
        chatId: initialData.config.chatId || "",
        discordWebhookUrl: initialData.config.discordWebhookUrl || "",
      },
    } : {
      type: "email",
      config: {
        name: "",
        smtpHost: "",
        smtpPort: 587,
        smtpUser: "",
        smtpPassword: "",
        smtpSecure: false,
        fromEmail: "",
        toEmail: "",
        webhookUrl: "",
        channel: "",
        url: "",
        method: "POST",
        headers: {},
        bodyTemplate: "",
        botToken: "",
        chatId: "",
        discordWebhookUrl: "",
      },
    },
  });

  const selectedType = form.watch("type");

  const testConnection = async () => {
    setIsTesting(true);
    try {
      const data = form.getValues();
      
      const response = await fetch('/api/notification-providers/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: data.type,
          config: data.config,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        toast.success(result.message || "Connection test successful!");
      } else {
        toast.error(result.error || "Connection test failed. Please check your configuration.");
      }
    } catch (error) {
      console.error("Error testing connection:", error);
      toast.error("Failed to test connection");
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      // Pass the data to the parent component
      onSuccess?.(data);
      
      // Reset form only if not in edit mode
      if (!initialData) {
        form.reset();
      }
      
      toast.success(initialData ? "Notification channel updated successfully" : "Notification channel created successfully");
    } catch (error) {
      console.error("Error saving notification provider:", error);
      toast.error("Failed to save notification channel");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Channel Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select channel type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="slack">Slack</SelectItem>
                        <SelectItem value="webhook">Webhook</SelectItem>
                        <SelectItem value="telegram">Telegram</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="config.name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Email Alerts" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Email Configuration */}
            {selectedType === "email" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Email Configuration</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="config.smtpHost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Host</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp.gmail.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="config.smtpPort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Port</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="587" 
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 587)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="config.smtpUser"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Username</FormLabel>
                        <FormControl>
                          <Input placeholder="your-email@gmail.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="config.smtpPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="your-app-password" {...field} />
                        </FormControl>
                       
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="config.fromEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>From Email</FormLabel>
                        <FormControl>
                          <Input placeholder="alerts@yourcompany.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="config.toEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>To Email</FormLabel>
                        <FormControl>
                          <Input placeholder="admin@yourcompany.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="config.smtpSecure"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>Use TLS/SSL</FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Enable secure connection (recommended)
                        </div>
                      </div>
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
            )}

            {/* Slack Configuration */}
            {selectedType === "slack" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Slack Configuration</h3>
                <FormField
                  control={form.control}
                  name="config.webhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Webhook URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://hooks.slack.com/services/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="config.channel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Channel (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="#alerts" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Webhook Configuration */}
            {selectedType === "webhook" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Webhook Configuration</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="config.url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://api.yourservice.com/alerts" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="config.method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Method</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select method" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="config.bodyTemplate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Body Template (optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder='{"message": "Monitor {{monitorName}} is {{status}}"}'
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Telegram Configuration */}
            {selectedType === "telegram" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Telegram Configuration</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="config.botToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bot Token</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="config.chatId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Chat ID</FormLabel>
                        <FormControl>
                          <Input placeholder="-123456789" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Discord Configuration */}
            {selectedType === "discord" && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Discord Configuration</h3>
                <FormField
                  control={form.control}
                  name="config.discordWebhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Webhook URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://discord.com/api/webhooks/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <div className="flex justify-between">
              <Button 
                type="button" 
                variant="secondary" 
                onClick={testConnection}
                disabled={isTesting || isSubmitting}
              >
                {isTesting ? "Testing..." : "Test Connection"}
              </Button>
              <div className="space-x-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || isTesting}>
                  {isSubmitting ? (initialData ? "Updating..." : "Creating...") : (initialData ? "Update Provider" : "Create Provider")}
                </Button>
              </div>
            </div>
          </form>
        </Form>
  );
} 