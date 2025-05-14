import { Metadata } from "next/types";

export const metadata: Metadata = {
  title: "Supertest | Create Test",
  description: "Create a new test for your application",
};

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
