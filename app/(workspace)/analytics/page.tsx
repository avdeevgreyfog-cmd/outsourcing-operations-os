import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { loadPortfolio } from "@/lib/data/portfolio";
import { PageHeader, Empty } from "@/components/UI";
import { SalesLayout } from "@/components/sales/SalesLayout";
import { PortfolioWorkspace } from "@/components/PortfolioWorkspace";

export default async function Analytics({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: requestedView } = await searchParams;
  const view = requestedView === "comparison" || requestedView === "workforce" ? requestedView : "portfolio";
  const actor = await requireActor();
  if (!hasCapability(actor.access, "analytics.portfolio.read")) return <Empty title="Нет доступа к портфелю" text="Для просмотра общей сводки нужны соответствующие права."/>;
  const data = await loadPortfolio(actor);
  const title = view === "comparison" ? "Сравнение объектов" : view === "workforce" ? "Подбор и персонал" : "Портфель";
  return <SalesLayout><PageHeader title={title} subtitle="Объекты, комплектация и отклонения в одном рабочем обзоре." breadcrumbs={[{ label: "Аналитика" }, { label: title }]}/><PortfolioWorkspace data={data} view={view}/></SalesLayout>;
}
