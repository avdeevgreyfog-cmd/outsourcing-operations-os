"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ContractRow } from "@/lib/commercial/contracts";
import { SalesEmpty, SalesMetrics, SalesSearch, SalesSegments } from "@/components/sales/SalesUI";
import { Status } from "@/components/UI";

type Filter = "all" | "work" | "signing" | "signed" | "blocked";

const statusLabels: Record<string,string> = {
  draft:"Черновик",negotiation:"Переговоры",internal_review:"Внутреннее согласование",approved:"Согласовано внутри",
  signing:"На подписании",signed:"Подписан",rejected:"На доработке",terminated:"Завершён",expired:"Истёк",
};
const kindLabels: Record<string,string> = { master:"Основной договор",framework:"Рамочный договор",specification:"Спецификация",addendum:"Доп. соглашение" };
const gateLabels: Record<string,string> = { blocked:"Запуск заблокирован",ready:"Готово к запуску",exception:"Запуск разрешён исключением" };

function tone(status:string){
  if(status==="signed")return "good" as const;
  if(["rejected","terminated","expired"].includes(status))return "bad" as const;
  if(["approved","signing"].includes(status))return "info" as const;
  if(status==="internal_review")return "warn" as const;
  return "neutral" as const;
}
function gateTone(gate:string){return gate==="ready"?"good" as const:gate==="exception"?"warn" as const:"neutral" as const;}
function belongs(row:ContractRow,filter:Filter){
  if(filter==="all")return true;
  if(filter==="work")return ["draft","negotiation","internal_review","approved","rejected"].includes(row.status);
  if(filter==="signing")return row.status==="signing";
  if(filter==="signed")return row.status==="signed";
  return row.launchGate==="blocked";
}

export function ContractsWorkspace({rows}:{rows:ContractRow[]}){
  const [filter,setFilter]=useState<Filter>("all");const [query,setQuery]=useState("");
  const visible=useMemo(()=>{const needle=query.trim().toLowerCase();return rows.filter(row=>belongs(row,filter)).filter(row=>!needle||`${row.title} ${row.number??""} ${row.client} ${row.request} ${row.object??""}`.toLowerCase().includes(needle));},[rows,filter,query]);
  const inWork=rows.filter(row=>!["signed","terminated","expired"].includes(row.status)).length;
  const signing=rows.filter(row=>row.status==="signing").length;
  const signed=rows.filter(row=>row.status==="signed").length;
  const blocked=rows.filter(row=>row.objectId&&row.launchGate==="blocked").length;
  return <div className="contracts-workspace">
    <SalesMetrics label="Сводка по договорам" items={[
      {label:"В работе",value:inWork,note:"черновики и согласование"},
      {label:"На подписании",value:signing,note:"ожидают подписания"},
      {label:"Подписано",value:signed,note:"действующие основания"},
      {label:"Блокируют запуск",value:blocked,note:"объекты в подготовке"},
    ]}/>
    <div className="sales-toolbar"><SalesSegments<Filter> label="Состояние договоров" value={filter} onChange={setFilter} items={[{value:"all",label:"Все"},{value:"work",label:"В работе"},{value:"signing",label:"На подписании"},{value:"signed",label:"Подписаны"},{value:"blocked",label:"Блокируют запуск"}]}/><SalesSearch value={query} onChange={setQuery} placeholder="Поиск по договору, клиенту, заявке или объекту"/></div>
    <div className="sales-results">Показано {visible.length} из {rows.length}</div>
    <div className="commercial-table-wrap">{visible.length?<table className="data-table contract-registry-table"><thead><tr><th>Договор</th><th>Клиент</th><th>Основание</th><th>Объект</th><th>Состояние</th><th>Допуск запуска</th><th>Версия</th><th>Обновлено</th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td><Link className="cell-title" href={`/contracts/${row.id}`}>{row.number||row.title}</Link><span className="cell-sub">{kindLabels[row.kind]??row.kind}</span></td><td>{row.client}</td><td><Link href={`/requests/${row.requestId}`}>{row.request}</Link>{row.proposalId&&<span className="cell-sub">КП №{row.proposalVersion??"—"}</span>}</td><td>{row.objectId?<Link href={`/objects/${row.objectId}`}>{row.object||"Объект"}</Link>:"—"}</td><td><Status tone={tone(row.status)}>{statusLabels[row.status]??row.status}</Status></td><td><Status tone={gateTone(row.launchGate)}>{gateLabels[row.launchGate]??row.launchGate}</Status></td><td className="num">v{row.version}</td><td>{row.updatedAt}</td></tr>)}</tbody></table>:<SalesEmpty onReset={()=>{setFilter("all");setQuery("");}}/>}</div>
  </div>;
}
