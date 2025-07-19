import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Mail,
  MessageSquare,
  Webhook,
  Bot,
  MessageCircle,
  Slack,
  BotMessageSquare,
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
    value: "job_failed",
    label: "Job Failed",
    icon: XCircle,
    color: "text-red-500",
  },
  {
    value: "job_success",
    label: "Job Success",
    icon: CheckCircle,
    color: "text-green-500",
  },
  {
    value: "job_timeout",
    label: "Job Timeout",
    icon: Clock,
    color: "text-yellow-500",
  },
  {
    value: "monitor_failure",
    label: "Monitor Failure",
    icon: XCircle,
    color: "text-red-500",
  },
  {
    value: "monitor_recovery",
    label: "Monitor Recovery",
    icon: CheckCircle,
    color: "text-green-500",
  },
  {
    value: "ssl_expiring",
    label: "SSL Expiring",
    icon: AlertCircle,
    color: "text-orange-500",
  },
];

export const notificationProviders = [
  {
    type: "email",
    label: "Email",
    icon: Mail,
    color: "text-blue-500",
  },
  {
    type: "slack",
    label: "Slack",
    icon: Slack,
    color: "text-sky-500",

  },
  {
    type: "webhook",
    label: "Webhook",
    icon: Webhook,
    color: "text-green-500",
  },
  {
    type: "telegram",
    label: "Telegram",
    icon: Bot,
    color: "text-blue-400",
  },
  {
    type: "discord",
    label: "Discord",
    icon: BotMessageSquare,
    color: "text-indigo-500",
  },
];

export const getNotificationProviderConfig = (type: string) => {
  return notificationProviders.find(provider => provider.type === type) || notificationProviders[0];
};
