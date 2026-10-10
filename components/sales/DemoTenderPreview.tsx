"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {Empty,KeyValue,PageHeader,Section,SummaryStrip} from "@/components/UI";
import type {TenderRow} from "@/lib/tenders/service";
import {formatTenderDateTime} from "@/lib/tenders/datetime";
import {tenderBillingLabels,tenderDecisionLabels,tenderEnumLabel,tenderPotentialLabels,tenderPriorityLabels,tenderResultLabels,tenderStageLabel} from "@/lib/tenders/model";

export const DEMO_TENDER_PREVIEW_PREFIX="operis:tenders:preview:";
export function demoTenderSnapshotKey(scope:string,id:string){return `${DEMO_TENDER_PREVIEW_PREFIX}${scope}:${id}`;}
export function loadDemoTenderSnapshot(scope:string,id:string):TenderRow|null{
  if(typeof window==="undefined")return null;
  try{
    const raw=sessionStorage.getItem(demoTenderSnapshotKey(scope,id));
    const snapshot=raw?JSON.parse(raw):null;
    const row=snapshot?.row;
    return snapshot?.scope===scope&&row?.id===id&&typeof row?.title==="string"?row:null;
  }catch{return null;}
}
export function saveDemoTenderSnapshot(scope:string,row:TenderRow):boolean{
  if(typeof window==="undefined")return false;
  try{sessionStorage.setItem(demoTenderSnapshotKey(scope,row.id),JSON.stringify({scope,row}));return true;}catch{return false;}
}

function display(value:unknown){return typeof value==="string"&&value.trim()?value:typeof value==="number"?String(value):"—";}
function money(value:number|string|null){return value==null?"—":new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(Number(value));}
function sourceHref(value:string|null){try{const url=new URL(value??"");return ["http:","https:"].includes(url.protocol)?url.href:null;}catch{return null;}}

export function DemoTenderPreview({id,canEdit,expectedScope}:{id:string;canEdit:boolean;expectedScope:string}){
  const [record,setRecord]=useState<TenderRow|null>(null);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      setRecord(loadDemoTenderSnapshot(expectedScope,id));
      setLoaded(true);
    },0);
    return ()=>window.clearTimeout(timer);
  },[id,expectedScope]);
  if(!loaded)return <p role="status">Загружаю карточку тендера…</p>;
  if(!record)return <Empty title="Тендер недоступен" text="В этой вкладке браузера нет сохранённой демонстрационной карточки. Откройте тендер из реестра." action={<Link className="button" href="/tenders">К реестру тендеров</Link>}/>;
  const source=sourceHref(record.sourceUrl);
  return <div className="sales-workspace tender-entity">
    <PageHeader eyebrow="Тендер" title={record.title} subtitle={`${display(record.customer)} · ${display(record.platform)}`} breadcrumbs={[{label:"Коммерция"},{label:"Тендеры",href:"/tenders"},{label:record.title}]} actions={<><Link className="button" href="/tenders">К реестру</Link>{canEdit&&<Link className="button" href={`/tenders?demoEdit=${encodeURIComponent(id)}`}>Редактировать</Link>}</>}/>
    <p className="muted" role="note">Демонстрационная карточка. Изменения доступны в реестре и сохраняются только в этом браузере; в рабочую базу они не записываются.</p>
    <Section title="Ключевые данные">
      <SummaryStrip><KeyValue label="Заказчик" value={display(record.customer)}/><KeyValue label="Площадка" value={display(record.platform)}/><KeyValue label="№ процедуры" value={display(record.procedureNumber)}/><KeyValue label="Источник" value={display(record.sourceName)}/></SummaryStrip>
      <SummaryStrip><KeyValue label="Дата публикации" value={record.publicationDate?record.publicationDate.slice(0,10).split("-").reverse().join("."):"—"}/><KeyValue label="Подача до" value={formatTenderDateTime(record.submissionDeadline)}/><KeyValue label="Начальная цена" value={money(record.initialPrice)}/><KeyValue label="Формат цены" value={tenderEnumLabel(tenderBillingLabels,record.billingUnit)}/></SummaryStrip>
      {source&&<a className="button" href={source} target="_blank" rel="noreferrer">Открыть закупку на площадке</a>}
    </Section>
    <Section title="Рабочий контур"><SummaryStrip><KeyValue label="Этап" value={tenderStageLabel(record.stage)}/><KeyValue label="Решение" value={tenderEnumLabel(tenderDecisionLabels,record.decision)}/><KeyValue label="Результат" value={record.result?tenderEnumLabel(tenderResultLabels,record.result):"Не зафиксирован"}/><KeyValue label="Ответственный" value={display(record.owner)}/></SummaryStrip><SummaryStrip><KeyValue label="Приоритет" value={tenderEnumLabel(tenderPriorityLabels,record.priority)}/><KeyValue label="Потенциал" value={tenderEnumLabel(tenderPotentialLabels,record.potential)}/><KeyValue label="Следующее действие" value={display(record.nextActionText)}/><KeyValue label="Срок следующего действия" value={formatTenderDateTime(record.nextActionAt)}/></SummaryStrip></Section>
    <Section title="Аналитическое заключение"><p style={{whiteSpace:"pre-wrap"}}>{record.analysisSummary||"Не заполнено"}</p></Section>
    <Section title="Связанные данные"><SummaryStrip><KeyValue label="Позиции" value={record.roleCount}/><KeyValue label="Документы готовы" value={`${record.readyRequirementCount} / ${record.requirementCount}`}/><KeyValue label="Расчёты" value={record.calculationCount}/><KeyValue label="Требуют внимания" value={record.blockerCount}/></SummaryStrip><p className="muted">Показатели взяты из реестра. Подробные позиции, документы, расчёты и история для этой демонстрационной записи не сохранены.</p></Section>
    {record.closeReason&&<Section title="Комментарий к результату"><p>{record.closeReason}</p></Section>}
  </div>;
}
