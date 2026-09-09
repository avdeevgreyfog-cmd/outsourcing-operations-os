"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProposalTemplateConfig, ProposalTemplateRow } from "@/lib/commercial/proposal-template";

function priceLabel(value:string){return value==="gross_only"?"Только с НДС":value==="net_only"?"Только без НДС":"Без НДС + с НДС";}

export function ProposalTemplateManager({initialTemplates}:{initialTemplates:ProposalTemplateRow[]}){
  const router=useRouter();
  const [selectedId,setSelectedId]=useState(initialTemplates[0]?.id??"");
  const [uploadOpen,setUploadOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const selected=useMemo(()=>initialTemplates.find(item=>item.id===selectedId)??initialTemplates[0],[initialTemplates,selectedId]);

  async function upload(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");
    try{
      const form=new FormData(event.currentTarget);
      const response=await fetch("/api/proposal-templates",{method:"POST",body:form});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось загрузить шаблон");
      setUploadOpen(false);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось загрузить шаблон");}finally{setBusy(false);}
  }

  async function saveConfig(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selected)return;setBusy(true);setError("");
    const fd=new FormData(event.currentTarget);
    const config:ProposalTemplateConfig={
      documentTitle:String(fd.get("documentTitle")??"").trim(),intro:String(fd.get("intro")??"").trim(),
      priceDisplay:String(fd.get("priceDisplay")??"both") as ProposalTemplateConfig["priceDisplay"],
      showIncluded:fd.get("showIncluded")==="on",showClientProvides:fd.get("showClientProvides")==="on",showTerms:fd.get("showTerms")==="on",
      showManager:fd.get("showManager")==="on",showCta:fd.get("showCta")==="on",cta:String(fd.get("cta")??"").trim(),accent:String(fd.get("accent")??"#183D34"),
    };
    try{
      const response=await fetch(`/api/proposal-templates/${selected.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({config})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить настройки");router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось сохранить настройки");}finally{setBusy(false);}
  }

  async function setDefault(){
    if(!selected)return;setBusy(true);setError("");
    try{const response=await fetch(`/api/proposal-templates/${selected.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({isDefault:true})});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось выбрать шаблон");router.refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:"Не удалось выбрать шаблон");}finally{setBusy(false);}
  }

  return <div className="template-manager">
    <aside className="template-list-panel">
      <header><div><strong>Шаблоны КП</strong><span>{initialTemplates.length} активных</span></div><button className="button compact primary" type="button" onClick={()=>setUploadOpen(true)}>Загрузить DOCX</button></header>
      <div className="template-list">{initialTemplates.map(item=><button key={item.id} type="button" className={item.id===selected?.id?"active":""} onClick={()=>setSelectedId(item.id)}><div><strong>{item.name}</strong><span>{item.kind==="docx"?"Word-шаблон":"Стандарт OPERIS"} · версия {item.version}</span></div>{item.isDefault&&<i>По умолчанию</i>}</button>)}</div>
    </aside>

    {selected?<main className="template-editor-panel">
      <header className="template-editor-header"><div><span className="eyebrow">Шаблон коммерческого предложения</span><h2>{selected.name}</h2><p>{selected.kind==="docx"?`Импортирован из ${selected.sourceFileName??"DOCX"}. OPERIS распознал структуру и использует её как основу настроек.`:"Нейтральный одностраничный шаблон для быстрого предложения ставки заказчику."}</p></div><div>{!selected.isDefault&&<button className="button" disabled={busy} onClick={setDefault}>Использовать по умолчанию</button>}</div></header>

      {selected.kind==="docx"&&"recognized" in selected.analysis&&<section className="template-analysis"><header><strong>Результат распознавания DOCX</strong><span>{selected.analysis.recognized?"Основная таблица ставок определена":"Нужно проверить сопоставление"}</span></header><div className="template-analysis-grid"><div><span>Таблиц</span><strong>{selected.analysis.tableCount}</strong></div><div><span>Таблица ставок</span><strong>{selected.analysis.priceTableIndex===null?"Не найдена":`№${selected.analysis.priceTableIndex+1}`}</strong></div><div><span>Заголовок</span><strong>{selected.analysis.titleCandidate??"—"}</strong></div><div><span>Акцент</span><strong>{selected.analysis.accentCandidate??"—"}</strong></div></div>{selected.analysis.priceColumns.length>0&&<div className="template-mapping">{selected.analysis.priceColumns.map((column,index)=><span key={`${column.source}-${index}`}>{column.source||`Колонка ${index+1}`} <b>→</b> {column.field==="specialty"?"Специальность":column.field==="count"?"Количество":column.field==="unit"?"Единица расчёта":column.field==="rateNet"?"Без НДС":column.field==="rateGross"?"С НДС":"Не сопоставлено"}</span>)}</div>}{selected.analysis.warnings.map((warning,index)=><p className="template-warning" key={index}>{warning}</p>)}</section>}

      <form className="template-config-form" key={`${selected.id}-${selected.updatedAt}`} onSubmit={saveConfig}>
        <section><header><strong>Основной документ</strong><span>Цена остаётся главным содержанием КП</span></header><label>Заголовок<input name="documentTitle" required defaultValue={selected.config.documentTitle}/></label><label>Короткое вступление<textarea name="intro" rows={3} defaultValue={selected.config.intro}/></label><div className="template-inline"><label>Показывать ставки<select name="priceDisplay" defaultValue={selected.config.priceDisplay}><option value="both">Без НДС + с НДС</option><option value="gross_only">Только с НДС</option><option value="net_only">Только без НДС</option></select></label><label>Акцент<input name="accent" pattern="#[0-9A-Fa-f]{6}" defaultValue={selected.config.accent}/></label></div></section>
        <section><header><strong>Дополнительные блоки</strong><span>Они выключены по умолчанию и включаются только когда нужны</span></header><div className="template-switches"><label><input type="checkbox" name="showIncluded" defaultChecked={selected.config.showIncluded}/><span><strong>В стоимость включено</strong><small>Подбор, оформление, координация и другие включённые расходы</small></span></label><label><input type="checkbox" name="showClientProvides" defaultChecked={selected.config.showClientProvides}/><span><strong>Предоставляет заказчик</strong><small>Спецодежда, инструмент, питание и другие условия</small></span></label><label><input type="checkbox" name="showTerms" defaultChecked={selected.config.showTerms}/><span><strong>Условия сотрудничества</strong><small>Показывать отдельный текстовый блок условий</small></span></label><label><input type="checkbox" name="showManager" defaultChecked={selected.config.showManager}/><span><strong>Ответственный менеджер</strong><small>Контакт для связи внизу документа</small></span></label><label><input type="checkbox" name="showCta" defaultChecked={selected.config.showCta}/><span><strong>Финальная фраза</strong><small>Короткий акцент перед контактами</small></span></label></div><label>Финальная фраза<textarea name="cta" rows={2} defaultValue={selected.config.cta}/></label></section>
        {error&&<div className="form-error">{error}</div>}<footer><span>В конкретном черновике КП эти настройки можно изменить без изменения общего шаблона.</span><button className="button primary" disabled={busy}>{busy?"Сохранение…":"Сохранить шаблон"}</button></footer>
      </form>
    </main>:<div className="empty">Шаблоны не найдены</div>}

    {uploadOpen&&<><div className="drawer-backdrop" onClick={()=>!busy&&setUploadOpen(false)}/><aside className="drawer template-upload-drawer"><header><div><span className="eyebrow">Импорт шаблона</span><h2>Загрузить Word-шаблон КП</h2><p>OPERIS прочитает структуру DOCX, попробует найти заголовок и таблицу ставок и покажет результат сопоставления.</p></div><button className="icon-button" onClick={()=>!busy&&setUploadOpen(false)}>×</button></header><form onSubmit={upload}><label>Название шаблона<input name="name" placeholder="Например, Основное КП"/></label><label className="template-file-field">Файл DOCX<input name="file" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required/><small>До 5 МБ. Исходный файл сохраняется как версия шаблона.</small></label><div className="foundation-notice"><strong>После загрузки проверьте распознавание</strong><span>Система не отправляет документ автоматически. Сначала вы подтверждаете настройки и видите предпросмотр.</span></div>{error&&<div className="form-error">{error}</div>}<footer><button type="button" className="button" onClick={()=>setUploadOpen(false)}>Отмена</button><button className="button primary" disabled={busy}>{busy?"Анализ…":"Загрузить и распознать"}</button></footer></form></aside></>}
  </div>;
}
