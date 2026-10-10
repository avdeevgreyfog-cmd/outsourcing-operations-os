"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {Empty,KeyValue,PageHeader,Section,SummaryStrip} from "@/components/UI";
import type {ClientRow} from "@/lib/data/service";

const PREFIX="operis:clients:preview:";
export function demoClientSnapshotKey(scope:string,id:string){return `${PREFIX}${scope}:${id}`;}
export function loadDemoClientSnapshot(scope:string,id:string):ClientRow|null{
  if(typeof window==="undefined")return null;
  try{
    const raw=sessionStorage.getItem(demoClientSnapshotKey(scope,id));
    const snapshot=raw?JSON.parse(raw):null,row=snapshot?.row;
    return snapshot?.scope===scope&&row?.id===id&&typeof row?.name==="string"&&typeof row?.organizationId==="string"&&typeof row?.status==="string"?row:null;
  }catch{return null;}
}
export function saveDemoClientSnapshot(scope:string,row:ClientRow,modified=false):boolean{
  if(typeof window==="undefined")return false;
  try{
    const key=demoClientSnapshotKey(scope,row.id),previous=JSON.parse(sessionStorage.getItem(key)??"null");
    sessionStorage.setItem(key,JSON.stringify({scope,row,modified:modified||previous?.modified===true}));return true;
  }catch{return false;}
}
export function loadDemoClientRows(scope:string):ClientRow[]{
  if(typeof window==="undefined")return [];
  const rows:ClientRow[]=[];
  try{for(let index=0;index<sessionStorage.length;index++){
    const key=sessionStorage.key(index);if(!key?.startsWith(`${PREFIX}${scope}:`))continue;
    const snapshot=JSON.parse(sessionStorage.getItem(key)??"null");
    const row=loadDemoClientSnapshot(scope,snapshot?.row?.id);
    if(snapshot?.modified===true&&row)rows.push(row);
  }}catch{}
  return rows;
}
function display(value:unknown){return typeof value==="string"&&value.trim()?value:typeof value==="number"?String(value):"—";}
const STATUS:Record<string,string>={active:"Активен",inactive:"Неактивен",blocked:"Заблокирован",archived:"Архив"};
export function DemoClientPreview({id,canEdit,expectedScope}:{id:string;canEdit:boolean;expectedScope:string}){
  const [record,setRecord]=useState<ClientRow|null>(null),[loaded,setLoaded]=useState(false);
  useEffect(()=>{const timer=window.setTimeout(()=>{setRecord(loadDemoClientSnapshot(expectedScope,id));setLoaded(true)},0);return()=>window.clearTimeout(timer)},[id,expectedScope]);
  if(!loaded)return <p role="status">Загружаю карточку клиента…</p>;
  if(!record)return <Empty title="Клиент недоступен" text="В этой вкладке браузера нет демонстрационной карточки. Откройте клиента из реестра." action={<Link className="button" href="/clients">К реестру клиентов</Link>}/>;
  return <div className="sales-workspace client-entity">
    <PageHeader title={record.name} subtitle={record.legalName??"Юридическое наименование не указано"} breadcrumbs={[{label:"Коммерция"},{label:"Клиенты",href:"/clients"},{label:record.name}]} actions={<><Link className="button" href="/clients">К реестру</Link>{canEdit&&<Link className="button" href={`/clients?demoEdit=${encodeURIComponent(id)}`}>Редактировать</Link>}</>}/>
    <p className="muted" role="note">Демонстрационная карточка. Изменения сохраняются только в этой вкладке браузера до её закрытия; в рабочую базу они не записываются.</p>
    <Section title="Основные данные"><SummaryStrip><KeyValue label="Юридическое наименование" value={display(record.legalName)}/><KeyValue label="ИНН" value={display(record.inn)}/><KeyValue label="Статус" value={STATUS[record.status]??"Другой статус"}/></SummaryStrip><SummaryStrip><KeyValue label="Ответственный" value={display(record.ownerName)}/><KeyValue label="Регион" value={display(record.region)}/><KeyValue label="Команда" value={display(record.teamName)}/></SummaryStrip></Section>
    <Section title="Основной контакт"><SummaryStrip><KeyValue label="Контакт" value={display(record.primaryContactName)}/><KeyValue label="Телефон" value={display(record.primaryContactPhone)}/><KeyValue label="Эл. почта" value={display(record.primaryContactEmail)}/></SummaryStrip></Section>
    {record.notes&&<Section title="Комментарий"><p style={{whiteSpace:"pre-wrap"}}>{record.notes}</p></Section>}
    <Section title="Связанные данные"><SummaryStrip><KeyValue label="Контакты" value={display(record.contacts)}/><KeyValue label="Заявки" value={display(record.requests)}/><KeyValue label="Объекты: активные / всего" value={`${display(record.activeObjects)} / ${display(record.objects)}`}/></SummaryStrip>{record.latestRequestTitle&&<p>Последняя заявка: {record.latestRequestTitle}</p>}<p className="muted">Показатели сохранены из реестра. Подробные контакты, документы, расчёты и история в этой демонстрационной карточке недоступны.</p></Section>
  </div>;
}
