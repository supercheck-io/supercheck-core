import { getIncidentDetail } from "@/actions/get-incident-detail";
import { PublicIncidentDetail } from "@/components/status-pages/public-incident-detail";
import { redirect } from "next/navigation";

type IncidentDetailPageProps = {
  params: Promise<{
    id: string;
    incidentId: string;
  }>;
};

export default async function IncidentDetailPage({ params }: IncidentDetailPageProps) {
  const resolvedParams = await params;
  const result = await getIncidentDetail(resolvedParams.incidentId);

  if (!result.success || !result.incident) {
    redirect(`/status-pages/${resolvedParams.id}/public`);
  }

  return (
    <PublicIncidentDetail
      incident={result.incident}
      statusPageId={resolvedParams.id}
    />
  );
}
