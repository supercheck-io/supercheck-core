import {
  CheckCircle,
  Activity,
  Clock,
  Globe,
  Pause,
  RefreshCw,
  Server,
  XCircle,
  Webhook,
} from "lucide-react";

export const monitorStatuses = [
  {
    value: "up",
    label: "Up",
    icon: CheckCircle,
    color: "text-green-500",
  },
  {
    value: "down",
    label: "Down",
    icon: XCircle,
    color: "text-red-500",
  },
  {
    value: "paused",
    label: "Paused",
    icon: Pause,
    color: "text-gray-500",
  },
];

export const monitorTypes = [
  {
    label: "Ping",
    value: "ping",
    icon: Globe,
    color: "text-sky-500",
    description: "Simple HTTP HEAD request to check if a site is available",
  },
  {
    label: "GET",
    value: "get",
    icon: RefreshCw,
    color: "text-cyan-600",
    description: "HTTP GET request with optional expected response",
  },
  {
    label: "POST",
    value: "post",
    icon: Webhook,
    color: "text-blue-700",
    description: "HTTP POST request with expected status check",
  },

  {
    label: "TCP",
    value: "tcp",
    icon: Server,
    color: "text-teal-600",
    description: "Checks if a TCP port is accessible",
  },
]; 