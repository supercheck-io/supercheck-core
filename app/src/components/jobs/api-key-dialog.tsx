"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Key, Copy, AlertCircle, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { authClient } from "@/utils/auth-client";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

interface ApiKeyDialogProps {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApiKeyCreated: (apiKey: any) => void;
}

export function ApiKeyDialog({ 
  jobId, 
  open, 
  onOpenChange, 
  onApiKeyCreated 
}: ApiKeyDialogProps) {
  const [step, setStep] = useState<"form" | "success">("form");
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdExpiry, setCreatedExpiry] = useState<string | null>(null);

  const handleClose = () => {
    setStep("form");
    setName("");
    setExpiry(null);
    setCreatedKey(null);
    setCreatedExpiry(null);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Please enter a name for the API key");
      return;
    }

    try {
      setIsLoading(true);
      
      const response = await fetch(`/api/jobs/${jobId}/api-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          expiresIn: expiry ? Math.floor((expiry.getTime() - Date.now()) / 1000) : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to create API key");
      }

      setCreatedKey(data.apiKey.key);
      setCreatedExpiry(data.apiKey.expiresAt);
      setStep("success");
      onApiKeyCreated(data.apiKey);
      toast.success("API key created successfully");

    } catch (error) {
      console.error("Error creating API key:", error);
      toast.error("Failed to create API key: " + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleFinish = () => {
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "form" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                  <Key className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Create a new API key for remote job triggering
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Name *</Label>
                <Input
                  id="key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., GitHub Actions, Jenkins, CI Pipeline"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry Date (optional)</Label>
                <div className="flex items-center gap-2">
                  <Calendar
                    mode="single"
                    selected={expiry || undefined}
                    onSelect={(date) => setExpiry(date ?? null)}
                    fromDate={new Date()}
                    className="rounded-md border shadow-sm bg-background"
                  />
                  {expiry && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpiry(null)}
                      className="ml-2"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {expiry && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Expires: {format(expiry, "PPP")}
                  </div>
                )}
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This API key will only have permission to trigger this specific job.
                  You can manage or revoke it anytime from the CI/CD settings.
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !name.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create API Key"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30">
                  <Key className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <DialogTitle>API Key Created</DialogTitle>
                  <DialogDescription>
                    Your API key has been created successfully
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-3">
                    <p className="font-medium">Important: Copy your API key now!</p>
                    <p className="text-sm">
                      This is the only time you'll be able to see the full key. 
                      Store it securely as you won't be able to retrieve it again.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Your API Key</Label>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border">
                  <code className="flex-1 text-sm font-mono break-all">
                    {createdKey}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(createdKey!)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {createdExpiry && (
                <div className="text-xs text-muted-foreground">
                  Expires: {format(new Date(createdExpiry), "PPP p")}
                </div>
              )}

              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Name:</strong> {name}</p>
                <p><strong>Permissions:</strong> Can trigger this job only</p>
                <p><strong>Usage:</strong> Include in CI/CD pipelines as x-api-key header</p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleFinish} className="w-full">
                I've copied the key
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
} 