"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const demoRoles=[["director","Директор"],["sales","Менеджер по продажам"],["regional","Региональный менеджер"],["object","Менеджер объекта"],["recruiter","Рекрутер"],["economist","Экономист"],["finance","Финансист"]] as const;

function persistDemoRole(role:string){
  document.cookie=`oo_demo_role=${encodeURIComponent(role)}; Path=/; Max-Age=2592000; SameSite=Lax`;
  document.cookie="oo_workspace_mode=demo; Path=/; Max-Age=2592000; SameSite=Lax";
}

export function LoginForm({demo}:{demo:boolean}){
  const router=useRouter();
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  function demoLogin(role:string){
    setBusy(true);
    persistDemoRole(role);
    router.push("/");
    router.refresh();
  }

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    setBusy(true);
    setError("");
    const data=new FormData(event.currentTarget);
    const response=await fetch("/api/session/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(data))});
    if(!response.ok){
      const body=await response.json().catch(()=>({}));
      setError(body.error??"Ошибка входа");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return <div className="login-form-wrap">
    {demo&&<><div className="login-label">Демо-организация</div><div className="role-login-grid">{demoRoles.map(([code,label])=><button disabled={busy} type="button" key={code} onClick={()=>demoLogin(code)}>{label}</button>)}</div><div className="or"><span>или вход в рабочую организацию</span></div></>}
    <form onSubmit={submit} className="login-form">
      <label>Организация<input name="organization" defaultValue="sergey-work" autoComplete="organization"/></label>
      <label>Электронная почта<input name="email" type="email" placeholder="name@example.com" autoComplete="email"/></label>
      <label>Пароль<input name="password" type="password" autoComplete="current-password"/></label>
      {error&&<div className="form-error">{error}</div>}
      <button className="button primary" disabled={busy}>{busy?"Проверка…":"Войти"}</button>
    </form>
  </div>;
}
