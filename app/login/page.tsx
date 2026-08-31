import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/server";
import { LoginForm } from "@/components/LoginForm";
import { isDemoMode } from "@/lib/demo/mode";

export default async function LoginPage() {
  const actor = await getCurrentActor();
  if (actor) redirect("/");
  return <main className="login-shell"><div className="login-panel"><div className="brand brand-login"><span className="brand-mark">O</span><div><strong>OPERIS</strong><small>Операционная система аутсорсинга</small></div></div><div className="login-copy"><span className="eyebrow">Защищённое рабочее пространство</span><h1>Операционный контур аутсорсинга</h1><p>Единая цепочка от заявки и расчёта до смен, табеля, выплат и отчёта о прибылях и убытках. Авторизация проверяется на сервере; скрытие элементов интерфейса не является границей доступа.</p></div><LoginForm demo={isDemoMode()} /></div><aside className="login-aside"><div><span>Основной процесс</span><strong>Заявка → Расчёт → Объект → Сотрудник → Прибыли и убытки</strong></div><div className="login-grid"><span>Разграничение прав</span><span>Журнал изменений</span><span>Защита данных на уровне строк</span><span>Версионные ставки</span></div></aside></main>;
}
