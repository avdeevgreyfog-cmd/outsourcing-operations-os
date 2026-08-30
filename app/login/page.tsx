import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/server";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const actor = await getCurrentActor();
  if (actor) redirect("/");
  return <main className="login-shell"><div className="login-panel"><div className="brand brand-login"><span className="brand-mark">O</span><div><strong>OPERIS</strong><small>Outsourcing Operations OS</small></div></div><div className="login-copy"><span className="eyebrow">Secure workspace</span><h1>Операционный контур аутсорсинга</h1><p>Единая цепочка от заявки и расчёта до смен, табеля, выплат и P&amp;L. Авторизация проверяется на сервере; скрытие элементов интерфейса не является границей доступа.</p></div><LoginForm demo={process.env.DEMO_MODE === "true"} /></div><aside className="login-aside"><div><span>Golden Path</span><strong>Request → Calculation → Object → Worker → P&amp;L</strong></div><div className="login-grid"><span>Scoped permissions</span><span>Audit trail</span><span>PostgreSQL / RLS</span><span>Effective-dated rates</span></div></aside></main>;
}
