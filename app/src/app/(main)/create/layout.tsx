import { Metadata } from "next/types";

export const metadata: Metadata = {
  title: "Create | Supercheck",
  description: "Create a new test or monitor",
};

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
