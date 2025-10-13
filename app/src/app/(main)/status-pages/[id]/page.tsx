import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { StatusPageDetail } from "@/components/status-pages/status-page-detail";
import { getStatusPage } from "@/actions/get-status-page";
import { getMonitorsForStatusPage } from "@/actions/get-monitors-for-status-page";
import { getComponentGroups } from "@/actions/get-component-groups";
import { getComponents } from "@/actions/get-components";
import { redirect } from "next/navigation";

type StatusPagePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function StatusPagePage({ params }: StatusPagePageProps) {
  const resolvedParams = await params;
  const result = await getStatusPage(resolvedParams.id);

  if (!result.success || !result.statusPage) {
    redirect("/status-pages");
  }

  // Fetch monitors, component groups, and components
  const monitorsResult = await getMonitorsForStatusPage();
  const componentGroupsResult = await getComponentGroups(resolvedParams.id);
  const componentsResult = await getComponents(resolvedParams.id);

  // Check if components fetch was successful
  if (!componentsResult.success) {
    console.error("Failed to fetch components:", componentsResult.message);
    // We'll continue with empty components rather than redirecting to avoid breaking the page
  }

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Status Pages", href: "/status-pages" },
    { label: result.statusPage.name, isCurrentPage: true },
  ];

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200 m-4">
        <CardContent className="p-0">
          <StatusPageDetail
            statusPage={result.statusPage}
            monitors={monitorsResult.monitors || []}
            componentGroups={componentGroupsResult.componentGroups || []}
            components={componentsResult.components || []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
