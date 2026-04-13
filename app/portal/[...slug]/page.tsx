import DynamicPage from "@/components/dynamic-dashboard/DynamicPage";

export default async function DynamicDashboardPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const fullSlug = `/portal/${slug.join("/")}`;

  return <DynamicPage slug={fullSlug} />;
}
