import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { CreatePageContent } from "@/components/create/create-page-content";

export default function CreatePage() {
  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Create", isCurrentPage: true },
  ];

  return (
    <div>
      <PageBreadcrumbs items={breadcrumbs} />
      <CreatePageContent />
    </div>
  );
}
