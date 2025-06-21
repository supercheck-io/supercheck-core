// DTO for data passed in a monitor execution job
// This should reflect the data needed from the 'monitors' table in schema.ts

// Based on app/src/db/schema/schema.ts
export type MonitorType =
  | "http_request"
  | "ping_host"
  | "port_check";

export interface MonitorConfig {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
  headers?: Record<string, string>;
  body?: string; 
  expectedStatusCodes?: string;
  keywordInBody?: string; 
  keywordInBodyShouldBePresent?: boolean; 
  responseBodyJsonPath?: { path: string; expectedValue: any }; 
  auth?: {
    type: "none" | "basic" | "bearer";
    username?: string;
    password?: string;
    token?: string;
  };
  port?: number;
  protocol?: "tcp" | "udp";
  checkExpiration?: boolean;
  daysUntilExpirationWarning?: number;
  checkRevocation?: boolean;
  expectedIntervalSeconds?: number;
  gracePeriodSeconds?: number;
  timeoutSeconds?: number;
  regions?: string[];
  retryStrategy?: {
    maxRetries: number;
    backoffFactor: number;
  };
  alertChannels?: string[];
  [key: string]: any;
}

export class MonitorJobDataDto {
  monitorId: string; // From monitors.id
  type: MonitorType; // From monitors.type
  target: string; // From monitors.target
  config?: MonitorConfig; // From monitors.config
  frequencyMinutes?: number; // From monitors.frequencyMinutes, for scheduling decisions
} 