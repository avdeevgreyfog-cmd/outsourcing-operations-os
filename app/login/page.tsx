import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/server";
import { LoginForm } from "@/components/LoginForm";
import { isDemoMode } from "@/lib/demo/mode";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ force?: string }> }){
  const params=await searchParams;
  const forceWork=params.force==="work";
  const actor=await getCurrentActor();
  if(actor&&!actor.demo&&!forceWork) redirect("/");

  return <main className="login-shell">
    <div className="login-panel">
      <div className="brand brand-login"><span className="brand-mark"><Image src="/operis-symbol.svg" alt="" width={24} height={24} priority/></span><div><strong>OPERIS</strong><small>Операционная система аутсорсинга</small></div></div>
      <div className="login-copy">
        <span className="eyebrow">{forceWork?"Рабочая организация":"Защищённое рабочее пространство"}</span>
        <h1>{forceWork?"Вход в «Мою организацию»":"Операционный контур аутсорсинга"}</h1>
        <p>{forceWork
          ?"Это отдельный рабочий контур sergey-work. Данные БЕТА-компании сюда не переносятся, а новые функции OPERIS появляются здесь после общего релиза."
          :"Единая цепочка от заявки и расчёта до подбора, выхода, смен, табелей и финансов. Демо-организация отделена от рабочей организации и не содержит ваших реальных данных."}</p>
      </div>
      <LoginForm demo={isDemoMode()&&!forceWork}/>
    </div>
    <aside className="login-aside"><div><span>Основной процесс</span><strong>Заявка → Расчёт → Объект → Потребность → Кандидат → Сотрудник → Табель</strong></div><div className="login-grid"><span>Изоляция организаций</span><span>Режим проверки ролей</span><span>Журнал изменений</span><span>Серверные права доступа</span></div></aside>
  </main>;
}
