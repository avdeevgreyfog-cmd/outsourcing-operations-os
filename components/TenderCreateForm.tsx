"use client";

import {useEffect,useMemo,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import type {TenderOptions} from "@/lib/tenders/service";

type TenderCreateVariant="page"|"drawer";
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

type Props={
  options:TenderOptions;
  variant?:TenderCreateVariant;
  formId?:string;
  onDemoCreate?:(draft:TenderCreateDraft)=>void;
  onCancel?:()=>void;
  onValidityChange?:(valid:boolean)=>void;
};

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

export function TenderCreateForm({
  options,
  variant="page",
  formId="tender-create-form",
  onDemoCreate,
  onCancel,
  onValidityChange,
}:Props){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [form,setForm]=useState<TenderCreateState>(initialState);
  const valid=form.title.trim().length>=3;
  const selectedClient=useMemo(()=>options.clients.find(item=>item.id===form.clientId)??null,[options.clients,form.clientId]);

  useEffect(()=>{onValidityChange?.(valid)},[onValidityChange,valid]);

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
    if(busy||!valid)return;
    const payload=draft();
    setError("");
    if(onDemoCreate){onDemoCreate(payload);return}
    setBusy(true);
    try{
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
  function cancel(){
    if(onCancel){onCancel();return}
    router.push("/tenders");
  }

  return <form id={formId} className={`tender-create-form tender-create-form-${variant}`} onSubmit={submit} aria-busy={busy}>
    <div className="tender-create-sections">
      <section className="tender-create-section">
        <header>
          <div><span>01</span><h2>Основные данные</h2></div>
          <p>Зафиксируйте закупку и срок подачи. Детальный разбор требований выполняется уже в карточке тендера.</p>
        </header>
        <div className="tender-create-fields">
          <label className="tender-create-field-wide"><span>Название тендера *</span><input required minLength={3} maxLength={300} value={form.title} onChange={event=>set("title",event.target.value)} placeholder="Например, предоставление линейного персонала"/></label>
          <label><span>Клиент в OPERIS</span><select value={form.clientId} onChange={event=>setClient(event.target.value)}><option value="">Пока не привязан</option>{options.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Заказчик по закупке</span><input list="tender-customer-options" value={form.customerName} onChange={event=>set("customerName",event.target.value)} placeholder="ООО / АО / учреждение"/><datalist id="tender-customer-options">{options.customers.map(item=><option key={item} value={item}/>)}</datalist>{selectedClient&&<small>Связан с клиентом: {selectedClient.name}</small>}</label>
          <label><span>Площадка</span><input list="tender-platform-options" value={form.platform} onChange={event=>set("platform",event.target.value)} placeholder="ЕИС, РТС-тендер, B2B-Center…"/><datalist id="tender-platform-options">{options.platforms.map(item=><option key={item} value={item}/>)}</datalist></label>
          <label><span>Номер торга</span><input value={form.procedureNumber} onChange={event=>set("procedureNumber",event.target.value)} placeholder="Номер закупки / процедуры"/></label>
          <label><span>Подача до</span><input type="datetime-local" value={form.submissionDeadline} onChange={event=>set("submissionDeadline",event.target.value)}/><small>Рекомендуется заполнить сразу — от срока зависят сигналы и контроль подготовки.</small></label>
          <label><span>Дата публикации</span><input type="date" value={form.publicationDate} onChange={event=>set("publicationDate",event.target.value)}/></label>
          <label className="tender-create-field-wide"><span>Ссылка на закупку</span><input type="url" value={form.sourceUrl} onChange={event=>set("sourceUrl",event.target.value)} placeholder="https://…"/></label>
        </div>
      </section>

      <section className="tender-create-section">
        <header>
          <div><span>02</span><h2>Условия и внутренняя привязка</h2></div>
          <p>Эти данные помогают сразу поставить тендер в нужный рабочий контекст. Их можно уточнить позже.</p>
        </header>
        <div className="tender-create-fields">
          <label><span>НМЦК / начальная цена, ₽</span><input type="number" min="0" step="any" value={form.initialPrice} onChange={event=>set("initialPrice",event.target.value)} placeholder="Если известна"/></label>
          <label><span>Регион</span><select value={form.regionId} onChange={event=>set("regionId",event.target.value)}><option value="">Не указан</option>{options.regions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Юрлицо для участия</span><select value={form.legalEntityId} onChange={event=>set("legalEntityId",event.target.value)}><option value="">Определить позже</option>{options.legalEntities.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Источник</span><input list="tender-source-options" value={form.sourceName} onChange={event=>set("sourceName",event.target.value)} placeholder="Ручной ввод, площадка, список аналитика…"/><datalist id="tender-source-options">{options.sources.map(item=><option key={item} value={item}/>)}</datalist></label>
          <label className="tender-create-field-wide"><span>Первичная заметка</span><textarea rows={4} maxLength={4000} value={form.comment} onChange={event=>set("comment",event.target.value)} placeholder="Что уже известно, что проверить в первую очередь, какие есть риски или вопросы"/></label>
        </div>
      </section>

      {error&&<div className="sales-notice sales-notice-error" role="alert"><strong>Не удалось создать тендер.</strong><span>{error}</span></div>}
    </div>

    {variant==="page"&&<aside className="tender-create-aside">
      <section className="tender-create-summary">
        <span>После регистрации</span>
        <h3>Продолжение — в карточке тендера</h3>
        <p>Запись создаётся на этапе «Новые». Ответственным становится текущий пользователь.</p>
        <ul><li>разбор требований и позиций;</li><li>Bid / No Bid и экономика;</li><li>документы, согласование и подача;</li><li>история результата и торгов.</li></ul>
      </section>
      <div className="tender-create-actions"><button className="button" type="button" onClick={cancel}>Отмена</button><button className="button primary" type="submit" disabled={busy||!valid}>{busy?"Создание…":"Создать тендер"}</button></div>
    </aside>}
  </form>;
}
