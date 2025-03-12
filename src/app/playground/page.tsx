import Playground from "@/components/playground";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export default function PlaygroundPage() {
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
