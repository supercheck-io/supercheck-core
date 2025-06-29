import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import Tests from "@/components/tests";

export default function TestsPage() {
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Tests", isCurrentPage: true },
  ];
  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <Tests />
    </div>
  );
} 