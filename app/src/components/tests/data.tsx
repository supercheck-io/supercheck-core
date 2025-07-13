import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Layers,
  Database,
  Chrome,
  ArrowLeftRight,
} from "lucide-react";


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
    color: "text-sky-600",
  },
  {
    label: "API",
    value: "api",
    icon: ArrowLeftRight,
    color: "text-teal-500",
  },
  {
    label: "Multi-step",
    value: "multistep",
    icon: Layers,
    color: "text-indigo-600",
  },
  {
    label: "Database",
    value: "database",
    icon: Database,
    color: "text-amber-600",
  },

];
