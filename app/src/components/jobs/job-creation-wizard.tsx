"use client";

import React, { useState } from "react";
import { CreateJob } from "./create-job";
import { AlertSettings } from "@/components/alerts/alert-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  const [jobData, setJobData] = useState<any>(null);
  const [alertConfig, setAlertConfig] = useState<JobAlertConfig>({
    enabled: false,
    notificationProviders: [],
    alertOnFailure: true,
    alertOnSuccess: false,
    alertOnTimeout: true,
    failureThreshold: 1,
    recoveryThreshold: 1,
  });

  const handleJobNext = (data: any) => {
    setJobData(data);
    setShowAlerts(true);
  };

  const handleCreateJob = async () => {
    try {
      const finalData = {
        ...jobData,
        alerts: alertConfig,
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

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log("Job created successfully:", result);
          
          // TODO: Save alert configuration to job-notification settings
          
          window.location.href = "/jobs";
        } else {
          throw new Error(result.error || "Failed to create job");
        }
      } else {
        const error = await response.json();
        console.error("Failed to create job:", error);
        throw new Error(error.error || "Failed to create job");
      }
    } catch (error) {
      console.error("Failed to create job:", error);
      // You might want to show an error toast here
    }
  };

  if (!showAlerts) {
    return (
      <CreateJob
        onSave={handleJobNext}
        onCancel={() => window.history.back()}
        hideAlerts={true}
      />
    );
  }

  return (
    <div className="space-y-6">
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

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setShowAlerts(false)}>
              Back
            </Button>
            <Button onClick={handleCreateJob}>
              Create Job
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 