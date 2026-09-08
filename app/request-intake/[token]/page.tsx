import { notFound } from "next/navigation";
import { getBlankRequestContext } from "@/lib/commercial/request-workflow-server";
import { PublicBlankRequestForm } from "@/components/PublicBlankRequestForm";

export const dynamic = "force-dynamic";

export default async function PublicIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const context = await getBlankRequestContext(token);
  if (!context) notFound();
  return <main className="public-request-page">
    <div className="public-request-wrap public-request-wrap-wide">
      <header className="public-request-header">
        <span className="eyebrow">{context.organizationName}</span>
        <h1>Заявка на предоставление персонала</h1>
        <p>Заполните известные условия. Если часть информации пока не определена, её можно уточнить с менеджером позже.</p>
      </header>
      <PublicBlankRequestForm context={context}/>
    </div>
  </main>;
}
