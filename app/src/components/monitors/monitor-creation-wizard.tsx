"use client";

import React, { useState, useEffect } from "react";
import { MonitorForm } from "./monitor-form";
import { AlertSettings } from "@/components/alerts/alert-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSearchParams, useRouter } from "next/navigation";

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
  const router = useRouter();
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

  // Get monitor type from URL for dynamic title
  const searchParams = useSearchParams();
  const type = searchParams?.get('type') || 'http_request';
  const typeLabel = type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  // Clear monitor data when URL changes and we're not in alert mode
  useEffect(() => {
    if (!showAlerts) {
      setMonitorData(null);
    }
  }, [type]);

  const handleMonitorNext = (data: any) => {
    setMonitorData(data);
    setShowAlerts(true);
  };

  const handleBack = () => {
    setShowAlerts(false);
  };

  const handleCancel = () => {
    router.push("/monitors");
  };

  const handleCreateMonitor = async () => {
    try {
      const finalData = {
        ...monitorData,
        alertConfig: alertConfig,
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
        
        // Redirect to monitors list using router
        router.push("/monitors");
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
          onCancel={handleCancel}
          hideAlerts={true}
          hideTypeSelector={true}
          monitorType={type as any}
          title={` ${typeLabel} Monitor`}
          description="Configure a new uptime monitor"
          // Pass monitorData to preserve state when navigating back
          initialData={monitorData}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
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
          <div className="flex justify-end gap-6 pt-4">
            <Button variant="outline" onClick={handleBack}>
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