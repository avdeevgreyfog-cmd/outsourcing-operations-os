"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const demoRoles = [["director","Director"],["sales","Sales Manager"],["regional","Regional Manager"],["object","Object Manager"],["recruiter","Recruiter"],["economist","Economist"],["finance","Finance"]];
function persistDemoRole(role:string){document.cookie=`oo_demo_role=${encodeURIComponent(role)}; Path=/; Max-Age=2592000; SameSite=Lax`}

export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter(); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  function demoLogin(role:string){setBusy(true);persistDemoRole(role);router.push("/");router.refresh();}
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const fd=new FormData(e.currentTarget);const r=await fetch("/api/session/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(fd))});if(!r.ok){const j=await r.json().catch(()=>({}));setError(j.error??"Ошибка входа");setBusy(false);return;}router.push("/");router.refresh();}
  return <div className="login-form-wrap">{demo && <><div className="login-label">Демо: войти под ролью</div><div className="role-login-grid">{demoRoles.map(([code,label])=><button disabled={busy} key={code} onClick={()=>demoLogin(code)}>{label}</button>)}</div><div className="or"><span>или production session</span></div></>}
    <form onSubmit={submit} className="login-form"><label>Организация<input name="organization" defaultValue="operis-demo" /></label><label>Email<input name="email" type="email" placeholder="director@demo.local" /></label><label>Пароль<input name="password" type="password" /></label>{error&&<div className="form-error">{error}</div>}<button className="button primary" disabled={busy}>{busy?"Проверка…":"Войти"}</button></form></div>;
}
