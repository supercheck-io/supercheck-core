import Tests from "@/components/tests";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export async function generateMetadata() {
  return {
    title: "Supercheck | Tests",
    description: "View and manage all tests",
  };
}

export default function PlaygroundPage() {
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
