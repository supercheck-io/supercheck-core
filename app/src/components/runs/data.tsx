import {
  CheckCircle,
  AlertCircle,
  PlayCircle,
  XCircle,
} from "lucide-react";

export const runStatuses = [
  {
    value: "running",
    label: "Running",
    icon: PlayCircle,
    color: "text-blue-500",
  },
  {
    value: "passed",
    label: "Passed",
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
    value: "error",
    label: "Error",
    icon: AlertCircle,
    color: "text-orange-500",
  },
];
