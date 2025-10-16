import { PublicStatusPage } from "@/components/status-pages/public-status-page";
import { getStatusPage } from "@/actions/get-status-page";
import { getComponents } from "@/actions/get-components";
import { getIncidents } from "@/actions/get-incidents";
import { notFound } from "next/navigation";
import { Metadata } from "next";

type PublicStatusPagePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({
  params,
}: PublicStatusPagePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const result = await getStatusPage(resolvedParams.id);

  if (!result.success || !result.statusPage) {
    return {
      title: "Status Page Not Found",
    };
  }

  const { statusPage } = result;

  return {
    title: statusPage.headline || statusPage.name,
    description: statusPage.pageDescription || undefined,
    icons: statusPage.faviconLogo
      ? {
          icon: statusPage.faviconLogo,
          shortcut: statusPage.faviconLogo,
          apple: statusPage.faviconLogo,
        }
      : undefined,
  };
}

export default async function PublicStatusPagePage({
  params,
}: PublicStatusPagePageProps) {
  const resolvedParams = await params;
  const result = await getStatusPage(resolvedParams.id);

  if (!result.success || !result.statusPage) {
    notFound();
  }

  // Fetch components and incidents for the status page
  const componentsResult = await getComponents(resolvedParams.id);
  const incidentsResult = await getIncidents(resolvedParams.id);

  return (
    <PublicStatusPage
      statusPage={result.statusPage}
      components={componentsResult.components}
      incidents={incidentsResult.incidents}
    />
  );
}
