"use client";

import React, { useState } from "react";
import { MonitorForm } from "./monitor-form";
import { AlertSettings } from "@/components/alerts/alert-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";


interface AlertConfig {
  enabled: boolean;
  notificationProviders: string[];
  alertOnFailure: boolean;
  alertOnRecovery: boolean;
  alertOnSslExpiration: boolean;
  failureThreshold: number;
  recoveryThreshold: number;
  customMessage?: string;
}

export function MonitorCreationWizard() {
  const [showAlerts, setShowAlerts] = useState(false);
  const [monitorData, setMonitorData] = useState<any>(null);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    enabled: false,
    notificationProviders: [],
    alertOnFailure: true,
    alertOnRecovery: true,
    alertOnSslExpiration: false,
    failureThreshold: 1,
    recoveryThreshold: 1,
  });

  const handleMonitorNext = (data: any) => {
    setMonitorData(data);
    setShowAlerts(true);
  };

  const handleCreateMonitor = async () => {
    try {
      const finalData = {
        ...monitorData,
        alerts: alertConfig,
      };
      
      console.log("Creating monitor with alerts:", finalData);
      
      // Create monitor via API
      const response = await fetch('/api/monitors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalData),
      });

      if (response.ok) {
        const createdMonitor = await response.json();
        console.log("Monitor created successfully:", createdMonitor);
        
        // TODO: Save alert configuration to monitor-notification settings
        
        // Redirect to monitors list
        window.location.href = "/monitors";
      } else {
        const error = await response.json();
        console.error("Failed to create monitor:", error);
        throw new Error(error.error || "Failed to create monitor");
      }
    } catch (error) {
      console.error("Failed to create monitor:", error);
      // You might want to show an error toast here
    }
  };

  if (!showAlerts) {
    return (
      <div className="space-y-4">
        <MonitorForm
          onSave={handleMonitorNext}
          onCancel={() => window.history.back()}
          hideAlerts={true}
          hideTypeSelector={true}
          title="Create New Monitor"
          description="Configure a new uptime monitor"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Alert Settings</CardTitle>
          <CardDescription>
            Configure notifications for this monitor
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
              customMessage: config.customMessage,
            })}
            context="monitor"
          />
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setShowAlerts(false)}>
              Back
            </Button>
            <Button onClick={handleCreateMonitor}>
              Create Monitor
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 