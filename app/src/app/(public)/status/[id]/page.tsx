import { PublicStatusPage } from "@/components/status-pages/public-status-page";
import { getPublicStatusPage } from "@/actions/get-public-status-page";
import { getPublicComponents } from "@/actions/get-public-components";
import { getPublicIncidents } from "@/actions/get-public-incidents";
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
  const result = await getPublicStatusPage(resolvedParams.id);

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
  const result = await getPublicStatusPage(resolvedParams.id);

  if (!result.success || !result.statusPage) {
    notFound();
  }

  // Fetch components and incidents for the status page
  const componentsResult = await getPublicComponents(resolvedParams.id);
  const incidentsResult = await getPublicIncidents(resolvedParams.id);

  return (
    <PublicStatusPage
      statusPage={result.statusPage}
      components={componentsResult.components}
      incidents={incidentsResult.incidents}
    />
  );
}
