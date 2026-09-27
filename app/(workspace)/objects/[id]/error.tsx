"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ObjectWorkspaceError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
  useEffect(()=>{
    console.error("[object-workspace] render failed",{digest:error.digest,error:error.message,stack:error.stack});
  },[error]);

  return <div className="object-workspace-compare object-workspace-pilot">
    <section className="section">
      <div className="section-head">
        <div>
          <div className="eyebrow">Объект</div>
          <h1>Не удалось открыть карточку объекта</h1>
          <p>Остальная рабочая организация продолжает работать. Повторите загрузку или вернитесь к списку объектов.</p>
        </div>
      </div>
      <div className="page-actions">
        <button className="button primary" type="button" onClick={reset}>Загрузить снова</button>
        <Link className="button" href="/objects">К объектам</Link>
      </div>
      {error.digest&&<p className="muted" style={{marginTop:16}}>Код ошибки: {error.digest}</p>}
    </section>
  </div>;
}
