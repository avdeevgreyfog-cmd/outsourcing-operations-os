import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/server";
import { LoginForm } from "@/components/LoginForm";
import { isDemoMode } from "@/lib/demo/mode";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ force?: string }> }){
  const params=await searchParams;
  const actor=await getCurrentActor();
  if(actor&&!actor.demo&&params.force!=="work") redirect("/");
  return <main className="login-shell">
    <div className="login-panel">
      <div className="brand brand-login"><span className="brand-mark"><Image src="/operis-symbol.svg" alt="" width={24} height={24} priority/></span><div><strong>OPERIS</strong><small>Операционная система аутсорсинга</small></div></div>
      <div className="login-copy"><span className="eyebrow">Защищённое рабочее пространство</span><h1>Операционный контур аутсорсинга</h1><p>Единая цепочка от заявки и расчёта до подбора, выхода, смен, табелей и финансов. Демо-организация отделена от рабочей организации и не содержит ваших реальных данных.</p></div>
      <LoginForm demo={isDemoMode()}/>
    </div>
    <aside className="login-aside"><div><span>Основной процесс</span><strong>Заявка → Расчёт → Объект → Потребность → Кандидат → Сотрудник → Табель</strong></div><div className="login-grid"><span>Изоляция организаций</span><span>Режим проверки ролей</span><span>Журнал изменений</span><span>Серверные права доступа</span></div></aside>
  </main>;
}
