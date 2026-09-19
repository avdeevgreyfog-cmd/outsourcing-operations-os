"use client";
import { FormEvent, useState } from "react";
import { KeyRound, LogOut, UserRound, X } from "lucide-react";
import type { Actor } from "@/lib/access/types";

export function AccountMenu({ actor }: { actor: Actor }) {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function changePassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=event.currentTarget;
    const data=new FormData(form);
    const next=String(data.get("newPassword")??"");
    const confirm=String(data.get("confirmPassword")??"");
    if(next!==confirm){setMessage("Новые пароли не совпадают.");return}
    setBusy(true);setMessage("");
    const response=await fetch("/api/session/password",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({currentPassword:data.get("currentPassword"),newPassword:next}),
    });
    const body=await response.json().catch(()=>({}));
    setBusy(false);
    if(!response.ok){setMessage(body.error??"Не удалось сменить пароль");return}
    form.reset();
    setMessage("Пароль изменён.");
  }

  async function logout(){
    setBusy(true);
    await fetch("/api/session/logout",{method:"POST"});
    window.location.assign("/login");
  }

  return <div className="account-menu">
    <button className="icon-button" type="button" aria-label="Аккаунт" aria-expanded={open} onClick={()=>setOpen((value)=>!value)}><UserRound size={16}/></button>
    {open&&<div className="account-popover" role="dialog" aria-label="Аккаунт">
      <header>
        <div><strong>{actor.displayName}</strong><small>{actor.email}</small></div>
        <button type="button" className="account-close" onClick={()=>setOpen(false)} aria-label="Закрыть"><X size={15}/></button>
      </header>
      <div className="account-context"><span>{actor.organizationName??"Демо-организация"}</span><strong>{actor.baseRoleName??actor.roleName}</strong></div>
      {!actor.demo&&<form onSubmit={changePassword} className="account-password-form">
        <div className="account-form-title"><KeyRound size={14}/>Сменить пароль</div>
        <input name="currentPassword" type="password" autoComplete="current-password" placeholder="Текущий пароль" required/>
        <input name="newPassword" type="password" autoComplete="new-password" placeholder="Новый пароль · минимум 12 знаков" minLength={12} required/>
        <input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Повторите новый пароль" minLength={12} required/>
        <button type="submit" className="button" disabled={busy}>Сохранить пароль</button>
      </form>}
      {message&&<p className="account-message">{message}</p>}
      <button type="button" className="account-logout" onClick={logout} disabled={busy}><LogOut size={14}/>Выйти</button>
    </div>}
  </div>;
}
