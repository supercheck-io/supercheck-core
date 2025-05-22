import { Metadata } from "next";
import { MonitorForm } from "@/components/monitors/monitor-form";
import { Monitor } from "@/components/monitors/schema";
import { notFound } from "next/navigation";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export const metadata: Metadata = {
  title: "Edit Monitor | Supercheck",
  description: "Edit your monitor configuration",
};

async function fetchMonitor(id: string): Promise<Monitor | null> {
  try {
    // In a real app, this would fetch the actual monitor
    // For now, we'll return mock data matching our sample data from the /api/monitors route
    return {
      id,
      name: "Example Monitor",
      url: "https://example.com/api/status",
      method: "get",
      status: "up",
      interval: 60,
      active: true,
    };
  } catch (error) {
    console.error("Error fetching monitor:", error);
    return null;
  }
}

export default async function EditMonitorPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const monitor = await fetchMonitor(id);

  if (!monitor) {
    notFound();
  }

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Monitors", href: "/monitors" },
    { label: monitor.name, href: `/monitors/${id}` },
    { label: "Edit", isCurrentPage: true },
  ];

  // Extract only the fields we need for the form
  const formData = {
    name: monitor.name,
    url: monitor.url,
    method: monitor.method,
    interval: monitor.interval,
    // Include optional fields if they exist
    expectedStatus: monitor.expectedStatus,
    expectedResponseBody: monitor.expectedResponseBody,
    port: monitor.port,
  };

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <MonitorForm 
        initialData={formData} 
        editMode={true} 
        id={id} 
      />
    </div>
  );
} 