import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
} from "lucide-react";

export const alertStatuses = [
  {
    value: "sent",
    label: "Sent",
    icon: CheckCircle,
    color: "text-green-500",
  },
  {
    value: "failed",
    label: "Failed",
    icon: XCircle,
    color: "text-red-500",
  },
  {
    value: "pending",
    label: "Pending",
    icon: Clock,
    color: "text-yellow-500",
  },
  {
    value: "error",
    label: "Error",
    icon: AlertCircle,
    color: "text-orange-500",
  },
];

export const alertTypes = [
  {
    value: "failure",
    label: "Failure",
    color: "text-red-500",
  },
  {
    value: "recovery",
    label: "Recovery", 
    color: "text-green-500",
  },
  {
    value: "ssl_expiration",
    label: "SSL Expiration",
    color: "text-orange-500",
  },
  {
    value: "job_failed",
    label: "Job Failed",
    color: "text-red-500",
  },
  {
    value: "job_success",
    label: "Job Success",
    color: "text-green-500",
  },
  {
    value: "job_timeout",
    label: "Job Timeout",
    color: "text-yellow-500",
  },
];

// Sample alert history data
export const sampleAlertHistory = [
  {
    id: "alert-1",
    message: "Monitor 'API Health Check' is down - HTTP 500 error",
    type: "failure",
    target: "API Health Check",
    targetType: "monitor",
    targetId: "monitor-1",
    provider: "Email",
    providerId: "provider-1",
    status: "sent",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    organizationId: "org-1",
  },
  {
    id: "alert-2", 
    message: "Job 'Daily Backup' completed successfully",
    type: "job_success",
    target: "Daily Backup",
    targetType: "job",
    targetId: "job-1",
    provider: "Slack",
    providerId: "provider-2",
    status: "sent",
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    organizationId: "org-1",
  },
  {
    id: "alert-3",
    message: "SSL certificate for 'example.com' expires in 7 days",
    type: "ssl_expiration",
    target: "Website Monitor",
    targetType: "monitor", 
    targetId: "monitor-2",
    provider: "Discord",
    providerId: "provider-3",
    status: "failed",
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    organizationId: "org-1",
  },
  {
    id: "alert-4",
    message: "Monitor 'Database Connection' has recovered",
    type: "recovery",
    target: "Database Connection",
    targetType: "monitor",
    targetId: "monitor-3", 
    provider: "Webhook",
    providerId: "provider-4",
    status: "sent",
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
    organizationId: "org-1",
  },
  {
    id: "alert-5",
    message: "Job 'Security Scan' failed with 3 test failures",
    type: "job_failed",
    target: "Security Scan",
    targetType: "job",
    targetId: "job-2",
    provider: "Telegram",
    providerId: "provider-5",
    status: "pending",
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
    organizationId: "org-1",
  },
];
