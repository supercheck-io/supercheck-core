import { Metadata } from "next/types";

export const metadata: Metadata = {
  title: "Supercheck | Test Runs",
  description: "View all test execution runs",
};

export default function RunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
