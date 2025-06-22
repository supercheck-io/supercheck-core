"use client";

import { MonitorForm, type FormValues } from "./monitor-form";

interface TypedMonitorFormProps {
  monitorType: FormValues["type"];
  title: string;
  description: string;
}

export function TypedMonitorForm({ monitorType, title, description }: TypedMonitorFormProps) {
  // Create default values with the specified monitor type
  const defaultValues: FormValues = {
    name: "",
    target: "",
    type: monitorType,
    interval: "60", // Default to 1 minute
    httpConfig_authType: "none",
    httpConfig_method: "GET",
    httpConfig_headers: undefined,
    httpConfig_body: undefined,
    httpConfig_expectedStatusCodes: "2xx",
    httpConfig_keywordInBody: undefined,
    httpConfig_keywordShouldBePresent: undefined,
    httpConfig_authUsername: undefined,
    httpConfig_authPassword: undefined,
    httpConfig_authToken: undefined,
    portConfig_port: undefined,
    portConfig_protocol: undefined,
    heartbeatConfig_expectedInterval: monitorType === "heartbeat" ? 60 : undefined,
    heartbeatConfig_gracePeriod: monitorType === "heartbeat" ? 10 : undefined,
    websiteConfig_enableSslCheck: monitorType === "website" ? false : undefined,
    websiteConfig_sslDaysUntilExpirationWarning: monitorType === "website" ? 30 : undefined,
  };

  return (
    <MonitorForm 
      initialData={defaultValues}
      editMode={false}
      hideTypeSelector={true}
    />
  );
} 