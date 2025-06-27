// Type for the result of a single monitor execution
// This should align with the 'monitor_results' table in schema.ts

// Based on app/src/db/schema/schema.ts
export type MonitorResultStatus = "up" | "down" | "error" | "timeout";

export type MonitorResultDetails = {
  statusCode?: number;
  statusText?: string;
  errorMessage?: string;
  responseHeaders?: Record<string, string>;
  responseBodySnippet?: string; 
  ipAddress?: string; 
  location?: string; 
  sslCertificate?: {
    valid: boolean;
    issuer?: string;
    subject?: string;
    validFrom?: string;
    validTo?: string;
    daysRemaining?: number;
  };
  [key: string]: any; // For other check-specific details
};

export type MonitorExecutionResult = {
  monitorId: string;
  status: MonitorResultStatus;
  checkedAt: Date;
  responseTimeMs?: number;
  details?: MonitorResultDetails;
  isUp: boolean;
  isStatusChange?: boolean;
  error?: string; // For capturing execution errors not part of 'details'
}; 