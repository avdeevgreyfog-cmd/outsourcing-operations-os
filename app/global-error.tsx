"use client";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    try {
      const key="operis:hard-recovery:"+window.location.pathname;
      if (window.sessionStorage.getItem(key)!=="1") {
        window.sessionStorage.setItem(key,"1");
        const url=new URL(window.location.href);
        url.searchParams.set("_operis_reload",Date.now().toString());
        window.location.replace(url.toString());
      }
    } catch {
      window.location.reload();
    }
  }, [error]);

  return <html lang="ru"><body style={{fontFamily:"system-ui, sans-serif",margin:0,minHeight:"100vh",display:"grid",placeItems:"center",background:"#fff",color:"#15191d"}}>
    <main style={{width:"min(560px, calc(100% - 48px))"}}>
      <strong style={{fontSize:14,color:"#f06419"}}>OPERIS</strong>
      <h1 style={{fontSize:32,lineHeight:1.15,margin:"14px 0 10px"}}>Не удалось загрузить интерфейс</h1>
      <p style={{fontSize:16,lineHeight:1.55,color:"#5c6570"}}>OPERIS автоматически выполняет полную загрузку актуальной версии. Если экран остался, нажмите кнопку ниже.</p>
      <button type="button" onClick={()=>window.location.replace(window.location.pathname+"?_operis_reload="+Date.now())} style={{border:0,borderRadius:8,padding:"12px 18px",fontWeight:700,cursor:"pointer"}}>Загрузить заново</button>
      <details style={{marginTop:24,fontSize:12,color:"#7a838c"}}>
        <summary>Техническая информация</summary>
        <pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{error.message}{error.digest?"\nID: "+error.digest:""}</pre>
      </details>
    </main>
  </body></html>;
}
