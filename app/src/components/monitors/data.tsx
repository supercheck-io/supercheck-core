import {
  CheckCircle,
  Clock,
  Pause,
  RefreshCw,
  XCircle,
  Network,
  Globe,
  Activity,
  LaptopMinimal,
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
  {
    value: "maintenance",
    label: "Maintenance",
    icon: RefreshCw,
    color: "text-blue-500",
  },
  {
    value: "error",
    label: "Error",
    icon: XCircle,
    color: "text-orange-500",
  },
];

export const monitorTypes = [
  {
    label: "HTTP Monitor",
    value: "http_request",
    icon: Globe,
    color: "text-cyan-500", 
    description: "Check HTTP/S endpoints (availability, status, response time)",
  },
  {
    label: "Website Monitor",
    value: "website",
    icon: LaptopMinimal,
    color: "text-blue-500", 
    description: "Monitor website availability and performance with optional SSL certificate checking",
  },
  {
    label: "Ping Monitor",
    value: "ping_host",
    icon: RefreshCw,
    color: "text-sky-500", 
    description: "ICMP ping to a host",
  },
  {
    label: "Port Monitor",
    value: "port_check",
    icon: Network,
    color: "text-indigo-500", 
    description: "Check specific TCP or UDP port",
  },
  {
    label: "Heartbeat Monitor",
    value: "heartbeat",
    icon: Activity,
    color: "text-teal-500", 
    description: "Passive monitoring expecting regular pings from your services",
  },
];
