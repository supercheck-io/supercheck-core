import { getPublicIncidentDetail } from "@/actions/get-public-incident-detail";
import { getPublicStatusPage } from "@/actions/get-public-status-page";
import { PublicIncidentDetail } from "@/components/status-pages/public-incident-detail";
import { notFound } from "next/navigation";
import { Metadata } from "next";

type PublicIncidentDetailPageProps = {
  params: Promise<{
    id: string;
    incidentId: string;
  }>;
};

export async function generateMetadata({
  params,
}: PublicIncidentDetailPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const result = await getPublicIncidentDetail(
    resolvedParams.incidentId,
    resolvedParams.id
  );

  if (!result.success || !result.incident) {
    return {
      title: "Incident Not Found",
    };
  }

  const statusPageResult = await getPublicStatusPage(resolvedParams.id);
  const statusPageName = statusPageResult.success
    ? statusPageResult.statusPage?.name
    : "Status Page";

  return {
    title: `${result.incident.name} - ${statusPageName}`,
    description: result.incident.body || undefined,
  };
}

export default async function PublicIncidentDetailPage({
  params,
}: PublicIncidentDetailPageProps) {
  const resolvedParams = await params;
  const result = await getPublicIncidentDetail(
    resolvedParams.incidentId,
    resolvedParams.id
  );

  if (!result.success || !result.incident) {
    notFound();
  }

  return (
    <PublicIncidentDetail
      incident={result.incident}
      statusPageId={resolvedParams.id}
    />
  );
}
