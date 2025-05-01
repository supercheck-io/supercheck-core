import {
  CheckCircle,
  Clock,
  AlertCircle,
  PlayCircle,
  SkipForward,
  XCircle,
} from "lucide-react";

export const runStatuses = [
  {
    value: "pending",
    label: "Pending",
    icon: Clock,
    color: "text-yellow-500",
  },
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
    value: "completed",
    label: "Completed",
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
    value: "skipped",
    label: "Skipped",
    icon: SkipForward,
    color: "text-gray-500",
  },
  {
    value: "error",
    label: "Error",
    icon: AlertCircle,
    color: "text-orange-500",
  },
];
