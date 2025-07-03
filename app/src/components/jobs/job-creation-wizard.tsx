"use client";

import React, { useState } from "react";
import { CreateJob } from "./create-job";
import { AlertSettings } from "@/components/alerts/alert-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Test } from "./schema";

interface JobAlertConfig {
  enabled: boolean;
  notificationProviders: string[];
  alertOnFailure: boolean;
  alertOnSuccess: boolean;
  alertOnTimeout: boolean;
  failureThreshold: number;
  recoveryThreshold: number;
  customMessage?: string;
}

export function JobCreationWizard() {
  const [showAlerts, setShowAlerts] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cronSchedule: '',
    tests: [] as Test[],
  });
  const [alertConfig, setAlertConfig] = useState<JobAlertConfig>({
    enabled: false,
    notificationProviders: [],
    alertOnFailure: true,
    alertOnSuccess: false,
    alertOnTimeout: true,
    failureThreshold: 1,
    recoveryThreshold: 1,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleJobNext = (data: any) => {
    setFormData({
      name: data.name || '',
      description: data.description || '',
      cronSchedule: data.cronSchedule || '',
      tests: Array.isArray(data.tests) ? data.tests : [],
    });
    setShowAlerts(true);
  };

  const handleBack = () => {
    setShowAlerts(false);
  };

  const handleCreateJob = async () => {
    try {
      setIsSubmitting(true);
      const finalData = {
        ...formData,
        alertConfig: alertConfig,
      };
      
      console.log("Creating job with alerts:", finalData);
      
      // Create job via API
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalData),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log("Job created successfully:", result);
        toast.success("Success", {
          description: `Job "${finalData.name}" has been created.`,
        });
        window.location.href = "/jobs";
      } else {
        const errorMessage = result.error || result.message || "Failed to create job";
        console.error("Failed to create job:", errorMessage);
        toast.error("Failed to create job", {
          description: errorMessage
        });
      }
    } catch (error) {
      console.error("Failed to create job:", error);
      toast.error("Error", {
        description: error instanceof Error ? error.message : "An unexpected error occurred"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showAlerts) {
    return (
      <CreateJob
        onSave={handleJobNext}
        onCancel={() => window.history.back()}
        hideAlerts={true}
        initialValues={formData}
        selectedTests={formData.tests}
        setSelectedTests={(tests) => setFormData(prev => ({ ...prev, tests: Array.isArray(tests) ? tests : [] }))}
      />
    );
  }

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Job Alert Settings</CardTitle>
          <CardDescription>
            Configure notifications for job execution events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <AlertSettings
            value={alertConfig}
            onChange={(config) => setAlertConfig({
              enabled: config.enabled,
              notificationProviders: config.notificationProviders,
              alertOnFailure: config.alertOnFailure,
              alertOnSuccess: config.alertOnSuccess || false,
              alertOnTimeout: config.alertOnTimeout || false,
              failureThreshold: config.failureThreshold,
              recoveryThreshold: config.recoveryThreshold,
              customMessage: config.customMessage,
            })}
            context="job"
          />

          <div className="flex justify-end gap-6 pt-4">
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
            <Button 
              onClick={handleCreateJob} 
              disabled={isSubmitting}
              className="flex items-center"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Job"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 