import Playground from "@/components/playground";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

// In Next.js App Router, page components can be async
export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams; // Await the searchParams promise

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Playground", isCurrentPage: true },
  ];

  // Handle scriptType properly, ensuring it's a string or undefined
  let scriptType: string | undefined = undefined;

  if (typeof params.scriptType === "string") {
    scriptType = params.scriptType;
  } else if (Array.isArray(params.scriptType) && params.scriptType.length > 0) {
    scriptType = params.scriptType[0];
  }

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <Playground scriptType={scriptType} />
    </div>
  );
}
