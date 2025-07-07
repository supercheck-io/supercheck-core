"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Key, 
  Plus, 
  Copy, 
  MoreVertical, 
  Trash2, 
  Edit, 
  Eye, 
  EyeOff, 
  AlertCircle,
  CheckCircle,
  Loader2,
  ExternalLink,
  Info
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ApiKeyDialog } from "./api-key-dialog";
import { UrlTriggerTooltip } from "./url-trigger-tooltip";

interface ApiKey {
  id: string;
  name: string;
  start: string;
  enabled: boolean;
  createdAt: string;
  permissions: any;
}

interface CiCdSettingsProps {
  jobId: string;
  context: "create" | "edit";
}

export function CiCdSettings({ jobId, context }: CiCdSettingsProps) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoadingAction, setIsLoadingAction] = useState<string | null>(null);

  const triggerUrl = `${process.env.NEXT_PUBLIC_BASE_URL || window.location.origin}/api/jobs/${jobId}/trigger`;

  // Load existing API keys
  useEffect(() => {
    if (context === "edit") {
      loadApiKeys();
    }
  }, [jobId, context]);

  const loadApiKeys = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/jobs/${jobId}/api-keys`);
      const data = await response.json();

      if (data.success) {
        setApiKeys(data.apiKeys);
      } else {
        toast.error("Failed to load API keys");
      }
    } catch (error) {
      console.error("Error loading API keys:", error);
      toast.error("Failed to load API keys");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApiKeyCreated = (newApiKey: any) => {
    setApiKeys(prev => [...prev, {
      id: newApiKey.id,
      name: newApiKey.name,
      start: newApiKey.start,
      enabled: newApiKey.enabled,
      createdAt: newApiKey.createdAt,
      permissions: newApiKey.permissions,
    }]);
  };

  const handleToggleEnabled = async (apiKey: ApiKey) => {
    try {
      setIsLoadingAction(apiKey.id);
      
      const response = await fetch(`/api/jobs/${jobId}/api-keys/${apiKey.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: !apiKey.enabled,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setApiKeys(prev => prev.map(key => 
          key.id === apiKey.id 
            ? { ...key, enabled: !key.enabled }
            : key
        ));
        toast.success(`API key ${apiKey.enabled ? "disabled" : "enabled"}`);
      } else {
        toast.error("Failed to update API key");
      }
    } catch (error) {
      console.error("Error updating API key:", error);
      toast.error("Failed to update API key");
    } finally {
      setIsLoadingAction(null);
    }
  };

  const handleDeleteApiKey = async (apiKey: ApiKey) => {
    if (!confirm(`Are you sure you want to delete the API key "${apiKey.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      setIsLoadingAction(apiKey.id);
      
      const response = await fetch(`/api/jobs/${jobId}/api-keys/${apiKey.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setApiKeys(prev => prev.filter(key => key.id !== apiKey.id));
        toast.success("API key deleted successfully");
      } else {
        toast.error("Failed to delete API key");
      }
    } catch (error) {
      console.error("Error deleting API key:", error);
      toast.error("Failed to delete API key");
    } finally {
      setIsLoadingAction(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Job Trigger API Keys </h3>
            <UrlTriggerTooltip jobId={jobId} />
          </div>
        </div>
        <Button 
          onClick={() => setIsDialogOpen(true)}
          size="sm"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {/* API Keys List */}
      {/* <Card> */}
        {/* <CardHeader> */}
          {/* <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Keys
          </CardTitle>
          <CardDescription>
            Manage API keys for remote job triggering
          </CardDescription>
        </CardHeader> */}
        {/* <CardContent className="space-y-4"> */}
        <div className="space-y-4 bg-card p-4 rounded-lg border border-border/40"> 
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h4 className="text-lg font-medium mb-2">No API Keys</h4>
              <p className="text-sm">
                Create your first API key to start triggering jobs remotely
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((apiKey) => (
                <div
                  key={apiKey.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                      <Key className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{apiKey.name}</h4>
                        <Badge variant={apiKey.enabled ? "default" : "secondary"}>
                          {apiKey.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>Key: {apiKey.start}...</span>
                        <span>Created: {formatDate(apiKey.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleEnabled(apiKey)}
                      disabled={isLoadingAction === apiKey.id}
                    >
                      {apiKey.enabled ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDeleteApiKey(apiKey)}
                          className="text-destructive"
                          disabled={isLoadingAction === apiKey.id}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        {/* </CardContent> */}
      {/* </Card> */}

      {/* API Documentation */}

          <Alert  className="p-4 rounded-lg border border-border/70">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2 ">
                <p className="font-medium">Important Notes:</p>
                <ul className="text-sm space-y-1">
                  <li>• Store API keys securely in your CI/CD environment secrets</li>
                  <li>• Each API key can only trigger this specific job</li>
                  <li>• Monitor usage and rotate keys regularly for security</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
    

      {/* API Key Creation Dialog */}
      <ApiKeyDialog
        jobId={jobId}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onApiKeyCreated={handleApiKeyCreated}
      />
    </div>
  );
} 