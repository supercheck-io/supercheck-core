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
  Search,
  ShieldAlert,
  Network,
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
    value: "pending",
    label: "Pending",
    icon: Clock,
    color: "text-yellow-500",
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
    label: "HTTP Request",
    value: "http_request",
    icon: RefreshCw,
    color: "text-cyan-600",
    description: "Check HTTP/S endpoints (availability, status, response time)",
  },
  {
    label: "Ping Host",
    value: "ping_host",
    icon: Globe,
    color: "text-sky-500",
    description: "ICMP ping to a host",
  },
  {
    label: "Port Check",
    value: "port_check",
    icon: Network,
    color: "text-teal-600",
    description: "Check specific TCP or UDP port",
  },
]; 