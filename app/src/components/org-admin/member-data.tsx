import {
  Crown,
  Shield,
  User,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react";

export const memberRoles = [
  {
    value: "owner",
    label: "Owner",
    icon: Crown,
    color: "text-purple-600",
  },
  {
    value: "admin",
    label: "Admin",
    icon: Shield,
    color: "text-blue-600",
  },
  {
    value: "member",
    label: "Member",
    icon: User,
    color: "text-green-600",
  },
  {
    value: "viewer",
    label: "Viewer",
    icon: Eye,
    color: "text-gray-600",
  },
];

export const memberStatuses = [
  {
    value: "active",
    label: "Active",
    icon: CheckCircle,
    color: "text-green-600",
  },
  {
    value: "pending",
    label: "Pending Invitation",
    icon: Clock,
    color: "text-yellow-600",
  },
  {
    value: "expired",
    label: "Expired Invitation",
    icon: XCircle,
    color: "text-red-600",
  },
];