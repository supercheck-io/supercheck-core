import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Layers,
  Database,
  Chrome,
  ArrowLeftRight,
  FlaskConical,
  FileJson2,
} from "lucide-react";


export const priorities = [
  {
    label: "Low",
    value: "low",
    icon: ArrowDown,
    color: "text-gray-400",
  },
  {
    label: "Medium",
    value: "medium",
    icon: ArrowRight,
    color: "text-amber-500",
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
    label: "Database",
    value: "database",
    icon: Database,
    color: "text-amber-600",
  },
  {
    label: "Custom",
    value: "custom",
    icon: FileJson2,
    color: "text-blue-500",
  },


];
