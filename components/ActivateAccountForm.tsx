"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ActivateAccountForm({ token }: { token: string }) {
  const router = useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setBusy(true);
    setError("");
    const data=new FormData(event.currentTarget);
    const password=String(data.get("password")??"");
    const confirm=String(data.get("confirm")??"");
    if(password!==confirm){
      setBusy(false);
      setError("Пароли не совпадают.");
      return;
    }
    const response=await fetch("/api/session/activate",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({token,password}),
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok){
      setBusy(false);
      setError(body.error??"Не удалось активировать аккаунт.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return <form onSubmit={submit} className="activate-form">
    <label>Новый пароль<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required placeholder="Минимум 12 символов"/></label>
    <label>Повторите пароль<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required placeholder="Повторите пароль"/></label>
    {error&&<div className="form-error">{error}</div>}
    <button className="button primary" type="submit" disabled={busy}>{busy?"Активация…":"Активировать аккаунт"}</button>
  </form>;
}
