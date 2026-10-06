"use client";

import Link from "next/link";
import {useMemo,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {TenderOptions} from "@/lib/tenders/service";

const DEMO_TENDER_STORAGE_KEY="operis.demo-tender-created.v1";

type TenderCreateState={
  title:string;
  customerName:string;
  clientId:string;
  platform:string;
  procedureNumber:string;
  sourceUrl:string;
  sourceName:string;
  publicationDate:string;
  submissionDeadline:string;
  initialPrice:string;
  regionId:string;
  legalEntityId:string;
  comment:string;
};

export type TenderCreateDraft={
  title:string;
  customerName:string|null;
  clientId:string|null;
  platform:string|null;
  procedureNumber:string|null;
  sourceUrl:string|null;
  sourceName:string|null;
  publicationDate:string|null;
  submissionDeadline:string|null;
  initialPrice:number|null;
  regionId:string|null;
  legalEntityId:string|null;
  comment:string|null;
};

type Section="quick"|"purchase"|"conditions";
type Props={options:TenderOptions;demo?:boolean};

const initialState:TenderCreateState={
  title:"",
  customerName:"",
  clientId:"",
  platform:"",
  procedureNumber:"",
  sourceUrl:"",
  sourceName:"Ручной ввод",
  publicationDate:"",
  submissionDeadline:"",
  initialPrice:"",
  regionId:"",
  legalEntityId:"",
  comment:"",
};

function nullable(value:string){const clean=value.trim();return clean||null}
function toIso(value:string){if(!value)return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString()}
function toNumber(value:string){if(!value.trim())return null;const number=Number(value);return Number.isFinite(number)?number:null}

export function TenderCreateForm({options,demo=false}:Props){
  const router=useRouter();
  const [active,setActive]=useState<Section>("quick");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [form,setForm]=useState<TenderCreateState>(initialState);
  const valid=form.title.trim().length>=3;
  const selectedClient=useMemo(()=>options.clients.find(item=>item.id===form.clientId)??null,[options.clients,form.clientId]);

  function set<K extends keyof TenderCreateState>(key:K,value:TenderCreateState[K]){
    setForm(current=>({...current,[key]:value}));
  }
  function setClient(clientId:string){
    setForm(current=>{
      const client=options.clients.find(item=>item.id===clientId);
      const previous=options.clients.find(item=>item.id===current.clientId)?.name;
      const maySyncCustomer=!current.customerName.trim()||Boolean(previous&&current.customerName.trim()===previous);
      return {...current,clientId,customerName:maySyncCustomer&&client?client.name:current.customerName};
    });
  }
  function draft():TenderCreateDraft{
    return {
      title:form.title.trim(),
      customerName:nullable(form.customerName),
      clientId:form.clientId||null,
      platform:nullable(form.platform),
      procedureNumber:nullable(form.procedureNumber),
      sourceUrl:nullable(form.sourceUrl),
      sourceName:nullable(form.sourceName),
      publicationDate:form.publicationDate||null,
      submissionDeadline:toIso(form.submissionDeadline),
      initialPrice:toNumber(form.initialPrice),
      regionId:form.regionId||null,
      legalEntityId:form.legalEntityId||null,
      comment:nullable(form.comment),
    };
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    if(busy)return;
    if(!valid){setError("Укажите название тендера — минимум 3 символа.");setActive("quick");return}
    const payload=draft();
    setBusy(true);setError("");
    try{
      if(demo){
        window.sessionStorage.setItem(DEMO_TENDER_STORAGE_KEY,JSON.stringify(payload));
        router.push("/tenders");
        router.refresh();
        return;
      }
      const response=await fetch("/api/tenders",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify(payload),
      });
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось создать тендер");
      router.push(`/tenders/${json.id}`);
      router.refresh();
    }catch(cause){
      setError(cause instanceof Error?cause.message:"Не удалось создать тендер");
    }finally{
      setBusy(false);
    }
  }

  const deadlineLabel=form.submissionDeadline?new Date(form.submissionDeadline).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"срок не указан";
  const customerLabel=selectedClient?.name||form.customerName.trim()||"заказчик не указан";

  return <form className="request-v2-layout request-intake-unified-layout tender-create-workspace" onSubmit={submit} aria-busy={busy}>
    <aside className="request-v2-nav">
      <div className="request-v2-nav-summary"><strong>Новый тендер</strong><span>{customerLabel} · {deadlineLabel}</span></div>
      <button type="button" aria-pressed={active==="quick"} className={active==="quick"?"active":""} onClick={()=>setActive("quick")}><span>↳</span>Быстрое заполнение</button>
      <button type="button" aria-pressed={active==="purchase"} className={active==="purchase"?"active":""} onClick={()=>setActive("purchase")}><span>1</span>Закупка</button>
      <button type="button" aria-pressed={active==="conditions"} className={active==="conditions"?"active":""} onClick={()=>setActive("conditions")}><span>2</span>Условия и привязка</button>
    </aside>

    <main className="request-v2-main">
      <fieldset className="request-intake-fieldset" disabled={busy}>
        {error&&<div className="request-warning" role="alert"><strong>Проверьте данные.</strong> {error}</div>}
        {demo&&<div className="request-inline-note">Демонстрационный режим: созданный тендер появится в реестре текущей сессии и не будет записан в рабочую БД.</div>}

        {active==="quick"&&<section className="request-v2-section request-quick-section">
          <header><div><h2>Быстрое заполнение</h2><p>Минимум данных, чтобы зарегистрировать закупку. Детальный анализ, документы, Bid / No Bid и расчёты ведутся уже в карточке тендера.</p></div></header>
          <div className="request-form-grid cols-2">
            <label>Название тендера *<input required minLength={3} maxLength={300} value={form.title} onChange={event=>set("title",event.target.value)} placeholder="Например, предоставление линейного персонала"/></label>
            <label>Клиент в базе<select value={form.clientId} onChange={event=>setClient(event.target.value)}><option value="">Пока не привязан</option>{options.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div>
          <div className="request-form-grid cols-3">
            <label>Заказчик по закупке<input list="tender-customer-options" value={form.customerName} onChange={event=>set("customerName",event.target.value)} placeholder="ООО / АО / учреждение"/><datalist id="tender-customer-options">{options.customers.map(item=><option key={item} value={item}/>)}</datalist></label>
            <label>Площадка<input list="tender-platform-options" value={form.platform} onChange={event=>set("platform",event.target.value)} placeholder="ЕИС, РТС-тендер, B2B-Center…"/><datalist id="tender-platform-options">{options.platforms.map(item=><option key={item} value={item}/>)}</datalist></label>
            <label>Номер закупки<input value={form.procedureNumber} onChange={event=>set("procedureNumber",event.target.value)} placeholder="Номер торгов / процедуры"/></label>
          </div>
          <div className="request-form-grid cols-3">
            <label>Подача до<input type="datetime-local" value={form.submissionDeadline} onChange={event=>set("submissionDeadline",event.target.value)}/><small>От срока зависят сигналы и контроль подготовки.</small></label>
            <label>НМЦК / начальная цена, ₽<input type="number" min="0" step="any" value={form.initialPrice} onChange={event=>set("initialPrice",event.target.value)} placeholder="Если известна"/></label>
            <label>Дата публикации<input type="date" value={form.publicationDate} onChange={event=>set("publicationDate",event.target.value)}/></label>
          </div>
          <label>Ссылка на закупку<input type="url" value={form.sourceUrl} onChange={event=>set("sourceUrl",event.target.value)} placeholder="https://…"/></label>
          <label>Первичная заметка<textarea rows={4} maxLength={4000} value={form.comment} onChange={event=>set("comment",event.target.value)} placeholder="Что уже известно, что проверить в первую очередь, какие есть риски или вопросы"/></label>
          <div className="request-quick-links"><button type="button" className="request-subtle-action" onClick={()=>setActive("purchase")}>Все данные закупки</button><button type="button" className="request-subtle-action" onClick={()=>setActive("conditions")}>Юрлицо, регион и источник</button></div>
        </section>}

        {active==="purchase"&&<section className="request-v2-section">
          <header><div><span>01</span><h2>Закупка</h2><p>Идентификация тендера, заказчика и исходной публикации. Эти данные используются в реестре и дальнейшей проверке условий.</p></div></header>
          <div className="request-form-grid cols-2">
            <label>Название тендера *<input required minLength={3} maxLength={300} value={form.title} onChange={event=>set("title",event.target.value)}/></label>
            <label>Клиент в OPERIS<select value={form.clientId} onChange={event=>setClient(event.target.value)}><option value="">Пока не привязан</option>{options.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>{selectedClient&&<small>Заказчик синхронизирован с клиентом, если его не меняли вручную.</small>}</label>
          </div>
          <div className="request-form-grid cols-2">
            <label>Заказчик по закупке<input list="tender-customer-options-full" value={form.customerName} onChange={event=>set("customerName",event.target.value)}/><datalist id="tender-customer-options-full">{options.customers.map(item=><option key={item} value={item}/>)}</datalist></label>
            <label>Площадка<input list="tender-platform-options-full" value={form.platform} onChange={event=>set("platform",event.target.value)}/><datalist id="tender-platform-options-full">{options.platforms.map(item=><option key={item} value={item}/>)}</datalist></label>
          </div>
          <div className="request-form-grid cols-3">
            <label>Номер закупки<input value={form.procedureNumber} onChange={event=>set("procedureNumber",event.target.value)}/></label>
            <label>Дата публикации<input type="date" value={form.publicationDate} onChange={event=>set("publicationDate",event.target.value)}/></label>
            <label>Подача до<input type="datetime-local" value={form.submissionDeadline} onChange={event=>set("submissionDeadline",event.target.value)}/></label>
          </div>
          <label>Ссылка на закупку<input type="url" value={form.sourceUrl} onChange={event=>set("sourceUrl",event.target.value)} placeholder="https://…"/></label>
        </section>}

        {active==="conditions"&&<section className="request-v2-section">
          <header><div><span>02</span><h2>Условия и внутренняя привязка</h2><p>Коммерческий ориентир и внутренний контекст. Всё можно уточнить позже в карточке тендера.</p></div></header>
          <div className="request-form-grid cols-3">
            <label>НМЦК / начальная цена, ₽<input type="number" min="0" step="any" value={form.initialPrice} onChange={event=>set("initialPrice",event.target.value)} placeholder="Если известна"/></label>
            <label>Регион<select value={form.regionId} onChange={event=>set("regionId",event.target.value)}><option value="">Не указан</option>{options.regions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Юрлицо для участия<select value={form.legalEntityId} onChange={event=>set("legalEntityId",event.target.value)}><option value="">Определить позже</option>{options.legalEntities.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div>
          <div className="request-form-grid cols-2">
            <label>Источник<input list="tender-source-options" value={form.sourceName} onChange={event=>set("sourceName",event.target.value)} placeholder="Ручной ввод, площадка, список аналитика…"/><datalist id="tender-source-options">{options.sources.map(item=><option key={item} value={item}/>)}</datalist></label>
            <label>Подача до<input type="datetime-local" value={form.submissionDeadline} onChange={event=>set("submissionDeadline",event.target.value)}/></label>
          </div>
          <label>Первичная заметка<textarea rows={5} maxLength={4000} value={form.comment} onChange={event=>set("comment",event.target.value)} placeholder="Риски, вопросы, ограничения и то, что нужно проверить при анализе"/></label>
          <div className="request-subsection"><h3>Что дальше</h3><p className="request-muted">После регистрации тендер попадает в «Новые». В карточке выполняются анализ условий, Bid / No Bid, расчёты, подготовка документов, согласование и подача.</p></div>
        </section>}

        <div className="request-v2-sticky">
          <div><small className="request-save-state" role="status">{valid?"Минимальные данные заполнены":"Укажите название тендера"}</small><span>Остальные поля можно дополнить после создания.</span></div>
          <div><Link href="/tenders" className="button">Отмена</Link><button className="button primary" type="submit" disabled={busy}>{busy?"Создание…":"Добавить тендер"}</button></div>
        </div>
      </fieldset>
    </main>
  </form>;
}

export {DEMO_TENDER_STORAGE_KEY};
