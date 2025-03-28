import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  Circle,
  CircleOff,
  HelpCircle,
  Timer,
  Chrome,
  Server,
  Layers,
  Database,
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
    color: "text-blue-500",
  },
  {
    label: "API",
    value: "api",
    icon: Server,
    color: "text-purple-500",
  },
  {
    label: "Multi-step",
    value: "multistep",
    icon: Layers,
    color: "text-pink-500",
  },
  {
    label: "Database",
    value: "database",
    icon: Database,
    color: "text-indigo-500",
  },
];
