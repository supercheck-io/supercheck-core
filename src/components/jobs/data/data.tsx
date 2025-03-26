import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  Circle,
  CircleOff,
  HelpCircle,
  Timer,
  Clock,
  AlertTriangle,
  Play,
  Pause,
} from "lucide-react"

export const labels = [
  {
    value: "bug",
    label: "Bug",
  },
  {
    value: "feature",
    label: "Feature",
  },
  {
    value: "documentation",
    label: "Documentation",
  },
]

export const statuses = [
  {
    value: "backlog",
    label: "Backlog",
    icon: HelpCircle,
  },
  {
    value: "todo",
    label: "Todo",
    icon: Circle,
  },
  {
    value: "in progress",
    label: "In Progress",
    icon: Timer,
  },
  {
    value: "done",
    label: "Done",
    icon: CheckCircle,
  },
  {
    value: "canceled",
    label: "Canceled",
    icon: CircleOff,
  },
]

export const jobStatuses = [
  {
    value: "pending",
    label: "Pending",
    icon: Clock,
    color: "text-yellow-500",
  },
  {
    value: "running",
    label: "Running",
    icon: Play,
    color: "text-blue-500",
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
    icon: AlertTriangle,
    color: "text-red-500",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    icon: Pause,
    color: "text-gray-500",
  },
]

export const priorities = [
  {
    label: "Low",
    value: "low",
    icon: ArrowDown,
  },
  {
    label: "Medium",
    value: "medium",
    icon: ArrowRight,
  },
  {
    label: "High",
    value: "high",
    icon: ArrowUp,
  },
]
