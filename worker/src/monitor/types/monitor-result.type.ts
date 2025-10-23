// Type for the result of a single monitor execution
// This should align with the 'monitor_results' table in schema.ts

import { MonitorResultStatus, MonitorResultDetails } from '../../db/schema';

// Re-export types for compatibility
export { MonitorResultStatus, MonitorResultDetails };

export type MonitorExecutionResult = {
  monitorId: string;
  location: string; // Monitoring location (e.g., 'us-east', 'eu-west')
  status: MonitorResultStatus;
  checkedAt: Date;
  responseTimeMs?: number;
  details?: MonitorResultDetails;
  isUp: boolean;
  isStatusChange?: boolean;
  error?: string; // For capturing execution errors not part of 'details'
  // For synthetic monitors - store test execution metadata
  testExecutionId?: string;
  testReportS3Url?: string;
};
