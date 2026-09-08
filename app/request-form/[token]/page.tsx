import { notFound } from "next/navigation";
import { getPublicRequestContext } from "@/lib/commercial/request-intake-server";
import { PublicRequestForm } from "@/components/PublicRequestForm";

export const dynamic = "force-dynamic";

export default async function PublicRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await getPublicRequestContext(token);
  if (!context) notFound();
  return <main className="public-request-page">
    <div className="public-request-wrap">
      <header className="public-request-header">
        <span className="eyebrow">{context.organizationName}</span>
        <h1>Уточнение заявки на персонал</h1>
        <p>Проверьте уже заполненную информацию и дополните недостающие условия. Регистрация не требуется.</p>
      </header>
      <PublicRequestForm token={token} context={context} />
    </div>
  </main>;
}
