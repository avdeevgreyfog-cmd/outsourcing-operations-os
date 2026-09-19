import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/lib/auth/server";
import { ActivateAccountForm } from "@/components/ActivateAccountForm";

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const actor=await getCurrentActor();
  if(actor&&!actor.demo) redirect("/");
  const params=await searchParams;
  const token=String(params.token??"");

  return <main className="login-shell">
    <div className="login-panel">
      <div className="brand brand-login"><span className="brand-mark"><Image src="/operis-symbol.svg" alt="" width={24} height={24} priority/></span><div><strong>OPERIS</strong><small>Операционная система аутсорсинга</small></div></div>
      <div className="login-copy activation-copy">
        <span className="eyebrow">Первичная активация</span>
        <h1>Настройте доступ к «Моей организации»</h1>
        <p>Задайте личный пароль для рабочего аккаунта. После сохранения ссылка активации станет недействительной, а вы автоматически войдёте в рабочую организацию.</p>
      </div>
      {token?<ActivateAccountForm token={token}/>:<div className="activation-invalid"><strong>Ссылка активации неполная</strong><p>Откройте персональную ссылку активации целиком.</p></div>}
    </div>
    <aside className="login-aside">
      <div><span>Рабочий контур</span><strong>Моя организация · Генеральный директор</strong></div>
      <div className="login-grid"><span>Изолированные данные</span><span>Полный доступ</span><span>Проверка ролей</span><span>Сквозные процессы</span></div>
    </aside>
  </main>;
}
