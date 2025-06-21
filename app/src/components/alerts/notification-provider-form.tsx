"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    isDefault: z.boolean().optional(),
    
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
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function NotificationProviderForm({ onSuccess, onCancel }: NotificationProviderFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(notificationProviderSchema),
    defaultValues: {
      type: "email",
      config: {
        name: "",
        isDefault: false,
        smtpSecure: false,
        method: "POST",
      },
    },
  });

  const selectedType = form.watch("type");

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/notification-providers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Failed to create notification provider");
      }

      toast.success("Notification provider created successfully");
      form.reset();
      onSuccess?.();
    } catch (error) {
      console.error("Error creating notification provider:", error);
      toast.error("Failed to create notification provider");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Add Notification Provider</CardTitle>
        <CardDescription>
          Configure how you want to receive monitor alerts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider type" />
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

            <FormField
              control={form.control}
              name="config.isDefault"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Default Provider</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Use this as the default notification method for new monitors
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
                            onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
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

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Creating..." : "Create Notification Provider"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
} 