// DTO for data passed in a monitor execution job
// This should reflect the data needed from the 'monitors' table in schema.ts

// Based on app/src/db/schema/schema.ts
export enum MonitorType {
  HTTP_REQUEST = 'http_request',
  WEBSITE = 'website',
  PING_HOST = 'ping_host',
  PORT_CHECK = 'port_check',
  HEARTBEAT = 'heartbeat',
}

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
  expectedIntervalMinutes?: number;
  gracePeriodMinutes?: number;
  heartbeatUrl?: string;
  lastPingAt?: string;
  checkExpiration?: boolean;
  daysUntilExpirationWarning?: number;
  checkRevocation?: boolean;
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