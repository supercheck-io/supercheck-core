import { PublicStatusPage } from "@/components/status-pages/public-status-page";
import { getPublicStatusPage } from "@/actions/get-public-status-page";
import { getPublicStatusPageBySubdomain } from "@/actions/get-public-status-page-by-subdomain";
import { getPublicComponents } from "@/actions/get-public-components";
import { getPublicIncidents } from "@/actions/get-public-incidents";
import { notFound } from "next/navigation";
import { Metadata } from "next";

type PublicStatusPagePageProps = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Status page lookup strategy:
 * 1. Try subdomain lookup first (from middleware rewrites)
 * 2. Fallback to ID lookup (for direct access or backward compatibility)
 *
 * This allows both:
 * - https://subdomain.supercheck.io → /status/subdomain
 * - https://app.supercheck.io/status/uuid → Direct ID access
 */
async function getStatusPageData(idOrSubdomain: string) {
  console.log("🔍 Status page lookup for:", idOrSubdomain);

  // Check if this looks like a UUID (contains hyphens or is 36 chars)
  const looksLikeUUID =
    idOrSubdomain.includes("-") ||
    (idOrSubdomain.length === 36 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrSubdomain
      ));

  // Try subdomain lookup first (most common case from middleware)
  if (!looksLikeUUID) {
    console.log("👉 Trying subdomain lookup");
    const subdomainResult = await getPublicStatusPageBySubdomain(
      idOrSubdomain
    );
    if (subdomainResult.success && subdomainResult.statusPage) {
      console.log("✅ Found by subdomain");
      return subdomainResult.statusPage;
    }
  }

  // Fallback to ID lookup
  console.log("👉 Trying ID lookup");
  const idResult = await getPublicStatusPage(idOrSubdomain);
  if (idResult.success && idResult.statusPage) {
    console.log("✅ Found by ID");
    return idResult.statusPage;
  }

  console.log("❌ Status page not found");
  return null;
}

export async function generateMetadata({
  params,
}: PublicStatusPagePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const statusPage = await getStatusPageData(resolvedParams.id);

  if (!statusPage) {
    return {
      title: "Status Page Not Found",
    };
  }

  return {
    title: statusPage.headline || statusPage.name,
    description: statusPage.pageDescription || undefined,
    // Remove favicon from metadata to let client-side useEffect handle it
    // This prevents conflicts and allows cache-busting to work properly
  };
}

export default async function PublicStatusPagePage({
  params,
}: PublicStatusPagePageProps) {
  const resolvedParams = await params;
  const statusPage = await getStatusPageData(resolvedParams.id);

  if (!statusPage) {
    notFound();
  }

  // Fetch components and incidents for the status page
  const componentsResult = await getPublicComponents(statusPage.id);
  const incidentsResult = await getPublicIncidents(statusPage.id);

  return (
    <PublicStatusPage
      statusPage={statusPage}
      components={componentsResult.components}
      incidents={incidentsResult.incidents}
      idOrSubdomain={resolvedParams.id}
      isPublicView
    />
  );
}
