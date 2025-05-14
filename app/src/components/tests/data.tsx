import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  Circle,
  CircleOff,
  HelpCircle,
  Timer,
  Layers,
  Database,
  Chrome,
  Webhook,
} from "lucide-react";

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
];

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
];

export const priorities = [
  {
    label: "Low",
    value: "low",
    icon: ArrowDown,
    color: "text-green-500",
  },
  {
    label: "Medium",
    value: "medium",
    icon: ArrowRight,
    color: "text-yellow-500",
  },
  {
    label: "High",
    value: "high",
    icon: ArrowUp,
    color: "text-red-500",
  },
];

export const types = [
  {
    label: "Browser",
    value: "browser",
    icon: Chrome,
    color: "text-sky-500",
  },
  {
    label: "API",
    value: "api",
    icon: Webhook,
    color: "text-cyan-600",
  },
  {
    label: "Multi-step",
    value: "multistep",
    icon: Layers,
    color: "text-blue-700",
  },
  {
    label: "Database",
    value: "database",
    icon: Database,
    color: "text-teal-600",
  },
];
