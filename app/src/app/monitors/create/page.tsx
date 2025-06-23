import { Metadata } from "next";
import { MonitorForm } from "@/components/monitors/monitor-form";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { monitorTypes } from "@/components/monitors/data";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Create Monitor | Supercheck",
  description: "Create a new monitor for uptime monitoring",
};

interface CreateMonitorPageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function CreateMonitorPage({ searchParams }: CreateMonitorPageProps) {
  const params = await searchParams;
  const monitorType = params.type;

  // If no type specified, show the general create page (existing functionality)
  if (!monitorType) {
    // Redirect to the existing create page with monitor options
    return (
      <div>
        <PageBreadcrumbs items={[
          { label: "Monitors", href: "/monitors" },
          { label: "Create", href: "/monitors/create" },
        ]} />
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-4">Create New Monitor</h1>
          <p className="text-muted-foreground mb-6">Select a monitor type to get started</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {monitorTypes.map((type) => (
              <a
                key={type.value}
                href={`/monitors/create?type=${type.value}`}
                className="block p-4 border rounded-lg hover:border-primary transition-colors"
              >
                <div className="flex items-center space-x-3">
                  {type.icon && <type.icon className={`h-6 w-6 ${type.color}`} />}
                  <div>
                    <h3 className="font-medium">{type.label}</h3>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Validate the monitor type
  const selectedMonitorType = monitorTypes.find(type => type.value === monitorType);
  if (!selectedMonitorType) {
    notFound();
  }

  const breadcrumbs = [
    { label: "Monitors", href: "/monitors" },
    { label: "Create", href: "/monitors/create" },
    { label: selectedMonitorType.label, href: `/monitors/create?type=${monitorType}` },
  ];

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <MonitorForm 
        monitorType={monitorType as "http_request" | "website" | "ping_host" | "port_check" | "heartbeat"}
        title={`Create ${selectedMonitorType.label}`}
        description={selectedMonitorType.description}
        hideTypeSelector={true}
      />
    </div>
  );
} 