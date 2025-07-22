import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings | Supercheck",
  description: "Configure your monitoring settings and preferences",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="container mx-auto py-6">
      {children}
    </main>
  );
} 