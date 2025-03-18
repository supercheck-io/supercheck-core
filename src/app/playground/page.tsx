import Playground from "@/components/playground";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

// In Next.js App Router, page components can be async
export default async function PlaygroundPage() {
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Playground", isCurrentPage: true },
  ];

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <Playground />
    </div>
  );
}
