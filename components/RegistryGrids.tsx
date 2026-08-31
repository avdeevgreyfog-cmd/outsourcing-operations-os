"use client";
import Link from "next/link";
import { DataGrid, type GridColumn } from "@/components/DataGrid";
import { Status } from "@/components/UI";
import { pct, rub } from "@/lib/ui/format";
import type { ClientRow, ObjectRow, WorkerRow, NeedRow, CandidateRow } from "@/lib/data/service";

export function ClientsGrid({rows}:{rows:ClientRow[]}) { const columns:GridColumn<ClientRow>[]=[
  {key:"name",label:"Компания",sticky:true,width:230,render:x=><><Link className="cell-title" href={`/clients/${x.id}`}>{x.name}</Link><span className="cell-sub">{x.legalName||"Юридическое лицо не указано"}</span></>},
  {key:"contacts",label:"Контакты",numeric:true},{key:"requests",label:"Заявки",numeric:true},{key:"objects",label:"Объекты",numeric:true},{key:"status",label:"Статус",render:x=><Status tone={x.status==="active"?"good":"neutral"}>{x.status}</Status>}
];return <DataGrid rows={rows} columns={columns} rowHref={x=>`/clients/${x.id}`} searchPlaceholder="Компания или юридическое лицо"/>}
export function ObjectsGrid({rows}:{rows:ObjectRow[]}) { const columns:GridColumn<ObjectRow>[]=[
  {key:"name",label:"Объект",sticky:true,width:240,render:x=><><Link className="cell-title" href={`/objects/${x.id}`}>{x.name}</Link><span className="cell-sub">{x.code}</span></>},{key:"client",label:"Клиент"},{key:"region",label:"Регион"},{key:"coverage",label:"Укомплектованность",numeric:true,render:x=><div style={{minWidth:105}}><div className="progress"><span style={{width:`${Math.min(100,x.coverage)}%`}}/></div><span className="cell-sub">{pct(x.coverage)}</span></div>},{key:"deficit",label:"Дефицит",numeric:true},{key:"targetStart",label:"Старт"},{key:"revenueForecast",label:"Прогноз выручки",numeric:true,render:x=>x.revenueForecast?rub(x.revenueForecast):"—"},{key:"risk",label:"Риск",render:x=><Status tone={x.risk==="critical"?"bad":x.risk==="high"||x.risk==="watch"?"warn":"good"}>{x.risk??x.status}</Status>}
];return <DataGrid rows={rows} columns={columns} rowHref={x=>`/objects/${x.id}`} searchPlaceholder="Объект, клиент, регион или код"/>}
export function WorkersGrid({rows,sensitive}:{rows:WorkerRow[];sensitive:boolean}) { const columns:GridColumn<WorkerRow>[]=[
  {key:"fullName",label:"Сотрудник",sticky:true,width:230,render:x=><Link className="cell-title" href={`/workers/${x.id}`}>{x.fullName}</Link>},{key:"object",label:"Текущий объект"},{key:"originalRecruiter",label:"Рекрутер / источник",render:x=><><span>{x.originalRecruiter??"—"}</span><span className="cell-sub">{x.origin??x.source??"—"}</span></>},{key:"employment",label:"Оформление"},...(sensitive?[{key:"rate" as const,label:"Ставка",numeric:true,render:(x:WorkerRow)=>x.rate==null?"—":rub(x.rate)},{key:"accrued" as const,label:"Начислено",numeric:true,render:(x:WorkerRow)=>x.accrued==null?"—":rub(x.accrued)},{key:"payable" as const,label:"К выплате",numeric:true,render:(x:WorkerRow)=>x.payable==null?"—":rub(x.payable)}]:[]),{key:"status",label:"Статус",render:x=><Status tone={x.status==="active"?"good":"neutral"}>{x.status}</Status>}
];return <DataGrid rows={rows} columns={columns} rowHref={x=>`/workers/${x.id}`} searchPlaceholder="Сотрудник, объект или источник"/>}
export function NeedsGrid({rows}:{rows:NeedRow[]}) { const columns:GridColumn<NeedRow>[]=[
  {key:"object",label:"Объект",sticky:true,width:220,render:x=><Link className="cell-title" href={`/objects/${x.objectId}?tab=needs`}>{x.object}</Link>},{key:"specialty",label:"Специальность"},{key:"required",label:"Нужно",numeric:true},{key:"filled",label:"Закрыто",numeric:true},{key:"deficit",label:"Дефицит",numeric:true},{key:"deadline",label:"Дедлайн"},{key:"status",label:"Статус",render:x=><Status tone={x.deficit?"warn":"good"}>{x.status}</Status>}
];return <DataGrid rows={rows} columns={columns} rowHref={x=>`/objects/${x.objectId}?tab=needs`} searchPlaceholder="Объект или специальность"/>}
export function CandidatesGrid({rows}:{rows:CandidateRow[]}) { const columns:GridColumn<CandidateRow>[]=[
  {key:"fullName",label:"Кандидат",sticky:true,width:230,render:x=><Link className="cell-title" href={`/candidates/${x.id}`}>{x.fullName}</Link>},{key:"stage",label:"Этап",render:x=><Status tone="info">{x.stageLabel??x.stage}</Status>},{key:"need",label:"Специальность"},{key:"object",label:"Объект"},{key:"source",label:"Источник"},{key:"nextAction",label:"Следующее действие"}
];return <DataGrid rows={rows} columns={columns} rowHref={x=>`/candidates/${x.id}`} searchPlaceholder="Кандидат, объект или источник"/>}
