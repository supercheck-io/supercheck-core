import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Supercheck | Alerts",
  description: "Monitor alert history and manage notification providers",
};

export default function AlertsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 