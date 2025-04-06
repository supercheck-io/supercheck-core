import { PageBreadcrumbs } from "@/components/page-breadcrumbs";

export default function Home() {

    const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Dashboard", isCurrentPage: true },
  ];
  return (
    <>
     <PageBreadcrumbs items={breadcrumbs} />
      <div className="grid auto-rows-min gap-4 md:grid-cols-3 m-4 mb-0">
        <div className="bg-muted/50 aspect-video rounded-xl" />
        <div className="bg-muted/50 aspect-video rounded-xl" />
        <div className="bg-muted/50 aspect-video rounded-xl" />
      </div>
      <div className="bg-muted/50 min-h-[100vh] flex-1 rounded-xl md:min-h-min m-4 mt-0" />
    </>
  );
}
