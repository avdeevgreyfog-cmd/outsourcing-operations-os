"use client";

import Link from "next/link";
import {Fragment,useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {CalendarClock,ChartNoAxesCombined,Columns3,Download,LayoutList,Pencil,Plus,X,ChevronRight,ArrowDownUp,ArrowUpRight,ExternalLink,RotateCcw} from "lucide-react";
import {DEMO_TENDER_PREVIEW_PREFIX,loadDemoTenderSnapshot,saveDemoTenderSnapshot} from "@/components/sales/DemoTenderPreview";
import {SalesRecordActions,SalesRecordTitle} from "@/components/sales/SalesRecordActions";
import {SalesDrawer,SalesEmpty,SalesSegments} from "@/components/sales/SalesUI";
import {TenderRegistryControls,useTenderRegistryPreferences} from "@/components/sales/TenderRegistryControls";
import {HorizontalScrollDock} from "@/components/registry/HorizontalScrollDock";
import {orderedRegistryColumns,registryPinnedOffset,registryWidth} from "@/lib/ui/registry-layout";
import {tenderColumns,tenderCustomerKey,type TenderColumnId,type TenderGroupId} from "@/lib/tenders/registry";
import {tenderDateTimeInput,tenderDateTimeIso} from "@/lib/tenders/datetime";
import type {TenderOptions,TenderRow} from "@/lib/tenders/service";
import type {TenderAnalyticsData} from "@/lib/tenders/analytics";
import type {TenderAnalyticsMetricPreference} from "@/lib/tenders/analytics-metric-registry";
import {TenderAnalytics} from "@/components/TenderAnalytics";
import {tenderBillingLabels,tenderDeadlineState,tenderDecisionLabels,tenderPotentialLabels,tenderResultLabels,tenderStageLabel,tenderStages} from "@/lib/tenders/model";
import {rub} from "@/lib/ui/format";
import {TenderImportPanel,type TenderImportRow,type TenderImportResult} from "@/components/TenderImportPanel";
import {DEMO_TENDER_STORAGE_KEY,type TenderCreateDraft} from "@/components/TenderCreateForm";

type View="list"|"board"|"analytics";

function formatDate(value:string|null){
  if(!value)return "—";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?value:date.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Moscow"});
}
function deadlineClass(key:string){return key==="overdue"||key==="today"?"danger":key==="urgent"?"warn":"neutral";}
function isClientDemoRow(row:TenderRow){return row.id.startsWith("sample-user-")||row.id.startsWith("demo-local-");}
function uniqueKey(row:Pick<TenderRow,"platform"|"procedureNumber"|"sourceUrl"|"title"|"customer">){
  if(row.sourceUrl)return `url:${row.sourceUrl.toLowerCase()}`;
  if(row.platform&&row.procedureNumber)return `procedure:${row.platform.toLowerCase()}:${row.procedureNumber.toLowerCase()}`;
  return `fallback:${row.title.toLowerCase()}:${row.customer.toLowerCase()}`;
}
function toDemoRow(item:TenderImportRow):TenderRow{
  const now=new Date().toISOString();
  return {
    id:`demo-local-${crypto.randomUUID()}`,
    organizationId:"00000000-0000-4000-8000-000000000001",
    title:item.title,
    customer:item.customerName||"Заказчик не указан",
    clientId:null,
    platform:item.platform,
    procedureNumber:item.procedureNumber,
    sourceUrl:item.sourceUrl,
    sourceName:item.sourceName||"Ручной ввод",
    publicationDate:item.publicationDate,
    submissionDeadline:item.submissionDeadline,
    initialPrice:item.initialPrice,
    billingUnit:"unknown",
    stage:"new",
    decision:"undecided",
    result:null,
    closeReason:null,
    noBidReasonCode:null,
    noBidComment:null,
    resultReasonCode:null,
    priority:"normal",
    potential:"medium",
    analysisSummary:item.comment||null,
    nextActionText:"Изучить условия тендера",
    nextActionAt:null,
    owner:null,
    ownerUserId:null,
    createdByUserId:"10000000-0000-4000-8000-000000000002",
    teamId:null,
    regionId:null,
    legalEntityId:null,
    submittedAt:null,
    finalBidValue:null,
    updatedAt:now,
    createdAt:item.publicationDate||now,
    roleCount:0,
    requirementCount:0,
    readyRequirementCount:0,
    calculationCount:0,
    blockerCount:0,
  };
}

function toDemoCreatedRow(item:TenderCreateDraft,options:TenderOptions):TenderRow{
  const base=toDemoRow({
    title:item.title,
    customerName:item.customerName,
    platform:item.platform,
    procedureNumber:item.procedureNumber,
    sourceUrl:item.sourceUrl,
    publicationDate:item.publicationDate,
    submissionDeadline:item.submissionDeadline,
    initialPrice:item.initialPrice,
    comment:item.comment,
    sourceName:item.sourceName??"Ручной ввод",
  });
  const linkedClient=item.clientId?options.clients.find(client=>client.id===item.clientId):null;
  return {...base,customer:linkedClient?.name??item.customerName??"Заказчик не указан",clientId:item.clientId,regionId:item.regionId,legalEntityId:item.legalEntityId};
}

function TenderStageBadge({stage}:{stage:(typeof tenderStages)[number]}) {
  return <span className={`request-stage-badge-polished request-stage-dot-${stage.color}`}><i/>{stage.label}</span>;
}
function TenderStatus({row}:{row:TenderRow}) {
  const tone=row.stage==="completed"?(row.result==="won"?"good":row.result==="lost"?"bad":"neutral"):row.stage==="clarification"?"warn":row.stage==="submitted"?"good":"neutral";
  return <span className={`tender-status tender-status-${tone}`}><i aria-hidden="true"/>{row.stage==="completed"?(row.result?tenderResultLabels[row.result]??"Результат уточняется":"Завершён"):tenderStages.find(stage=>stage.code===row.stage)?.label??"Этап уточняется"}</span>;
}
function sourceHref(value:string|null){try {const url=new URL(value??"");return ["http:","https:"].includes(url.protocol)?url.href:null;}catch{return null;}}
const numeric=(value:unknown)=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;
const dateNumber=(value:string|null)=>value&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
function inputDateTime(value:string|null){return tenderDateTimeInput(value);}
function inputDate(value:string|null){if(!value)return "";const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toISOString().slice(0,10);}
function isoDateTime(value:string,original?:string|null){return tenderDateTimeIso(value,original);}


export function TendersWorkspace({rows,options,analytics,metricPreferences,canConfigureAnalytics,demo,canCreate,canImport,canEdit,canSubmit=false,editableIds=[],preferenceScope,now,initialView="list"}: {
  rows:TenderRow[];options:TenderOptions;analytics:TenderAnalyticsData;metricPreferences:TenderAnalyticsMetricPreference[];canConfigureAnalytics:boolean;
  demo:boolean;canCreate:boolean;canImport:boolean;canEdit:boolean;canSubmit?:boolean;editableIds?:string[];preferenceScope:string;now:number;initialView?:View;
}) {
  const router=useRouter();
  const preferences=useTenderRegistryPreferences(preferenceScope);
  const {settings,update}=preferences;
  const [localRows,setLocalRows]=useState<TenderRow[]>([]);
  const [view,setView]=useState<View>(initialView);
  const [query,setQuery]=useState("");
  const [busyId,setBusyId]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const snapshotScope=preferenceScope.split(":").slice(0,3).join(":");
  const [demoEditing,setDemoEditing]=useState<TenderRow|null>(null);
  const [collapsedGroups,setCollapsedGroups]=useState<string[]>([]);
  const tableRef=useRef<HTMLDivElement>(null),boardRef=useRef<HTMLDivElement>(null);
  const resizing=useRef<{id:TenderColumnId;x:number;width:number}|null>(null);
  useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(!cancelled)setView(initialView);});return()=>{cancelled=true;};},[initialView]);
  useEffect(()=>{
    if(!demo)return;
    let raw:string|null=null;
    try{raw=window.sessionStorage.getItem(DEMO_TENDER_STORAGE_KEY);}catch{return;}
    if(!raw)return;
    let cancelled=false;
    queueMicrotask(()=>{
      if(cancelled)return;
      try{
        const draft=JSON.parse(raw!) as TenderCreateDraft;
        if(window.sessionStorage.getItem(DEMO_TENDER_STORAGE_KEY)===raw)window.sessionStorage.removeItem(DEMO_TENDER_STORAGE_KEY);
        const candidate=toDemoCreatedRow(draft,options);if(!saveDemoTenderSnapshot(snapshotScope,candidate))setError("Не удалось сохранить демонстрационную карточку в браузере.");
        setLocalRows(current=>current.some(row=>uniqueKey(row)===uniqueKey(candidate))?current:[candidate,...current]);
      }catch{
        setError("Не удалось восстановить демонстрационный тендер после создания.");
      }
    });
    return()=>{cancelled=true;};
  },[demo,options,snapshotScope]);
  useEffect(()=>{
    if(!demo)return;
    const params=new URLSearchParams(window.location.search);
    const editId=params.get("demoEdit");
    const stored:TenderRow[]=[];
    try{const prefix=`${DEMO_TENDER_PREVIEW_PREFIX}${snapshotScope}:`;for(let i=0;i<sessionStorage.length;i++){const key=sessionStorage.key(i);if(key?.startsWith(prefix)){const row=loadDemoTenderSnapshot(snapshotScope,key.slice(prefix.length));if(row)stored.push(row);}}}catch{/* Storage is optional in demo mode. */}
    const editRow=editId?loadDemoTenderSnapshot(snapshotScope,editId):null;
    const timer=window.setTimeout(()=>{
      setLocalRows(current=>[...current,...stored.filter(row=>!current.some(item=>item.id===row.id))]);
      if(editRow&&canEdit){setLocalRows(current=>[editRow,...current.filter(row=>row.id!==editRow.id)]);setDemoEditing(editRow);}
      if(editId){params.delete("demoEdit");window.history.replaceState(null,"",`/tenders${params.size?`?${params}`:""}`);}
    },0);
    return()=>window.clearTimeout(timer);
  },[demo,rows,snapshotScope,canEdit]);
  function tenderHref(row:TenderRow){return demo&&(isClientDemoRow(row)||localRows.some(item=>item.id===row.id))?`/tenders/new?preview=${encodeURIComponent(row.id)}`:`/tenders/${row.id}`;}
  function snapshot(row:TenderRow){if(demo&&!saveDemoTenderSnapshot(snapshotScope,row))setError("Браузер не разрешает сохранить демонстрационную карточку для перехода. Быстрый просмотр остаётся доступен.");}
  const items=useMemo(()=>{if(!demo)return rows;const overrides=new Set(localRows.map(row=>row.id));return [...localRows,...rows.filter(row=>!overrides.has(row.id))]},[demo,localRows,rows]);
  const editable=new Set(editableIds);
  const selected=items.find(row=>row.id===selectedId);
  const currentDate=useMemo(()=>new Date(now),[now]);
  function addDemoRows(imported:TenderImportRow[]):TenderImportResult {
    const keys=new Set(items.map(uniqueKey));const created:TenderRow[]=[];let skipped=0;
    for(const item of imported){const candidate=toDemoRow(item);const key=uniqueKey(candidate);if(keys.has(key)){skipped++;continue;}keys.add(key);snapshot(candidate);created.push(candidate);}
    setLocalRows(current=>[...created,...current]);return {imported:created.length,skipped};
  }
  function saveDemoEdit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!demoEditing)return;const fd=new FormData(event.currentTarget);
    const initialPriceRaw=String(fd.get("initialPrice")??"").trim();
    const next:TenderRow={...demoEditing,
      title:String(fd.get("title")??"").trim(),
      customer:String(fd.get("customer")??"").trim()||"Заказчик не указан",
      platform:String(fd.get("platform")??"").trim()||null,
      procedureNumber:String(fd.get("procedureNumber")??"").trim()||null,
      sourceUrl:String(fd.get("sourceUrl")??"").trim()||null,
      sourceName:String(fd.get("sourceName")??"").trim()||null,
      publicationDate:String(fd.get("publicationDate")??"").trim()||null,
      submissionDeadline:isoDateTime(String(fd.get("submissionDeadline")??""),demoEditing.submissionDeadline),
      initialPrice:initialPriceRaw?Number(initialPriceRaw):null,
      stage:String(fd.get("stage")??demoEditing.stage) as TenderRow["stage"],
      decision:String(fd.get("decision")??demoEditing.decision) as TenderRow["decision"],
      priority:String(fd.get("priority")??demoEditing.priority) as TenderRow["priority"],
      potential:String(fd.get("potential")??demoEditing.potential) as TenderRow["potential"],
      nextActionText:String(fd.get("nextActionText")??"").trim()||null,
      analysisSummary:String(fd.get("analysisSummary")??"").trim()||null,
      updatedAt:new Date().toISOString(),
    };
    snapshot(next);setLocalRows(current=>[next,...current.filter(row=>row.id!==next.id)]);setDemoEditing(null);setSelectedId(next.id);
  }
  const filtered=useMemo(()=>{
    const result=items.filter(row=>{
      if((row.stage==="completed")!==(settings.bucket==="completed"))return false;
      if(settings.stage&&row.stage!==settings.stage)return false;
      if(settings.owner&&(row.ownerUserId??"unassigned")!==settings.owner)return false;
      if(settings.customer&&tenderCustomerKey(row)!==settings.customer)return false;
      if(settings.platform&&row.platform!==settings.platform)return false;
      if(settings.source&&row.sourceName!==settings.source)return false;
      if(settings.decision&&row.decision!==settings.decision)return false;
      const state=tenderDeadlineState(row.submissionDeadline,currentDate);
      if(settings.deadline==="today"&&!["overdue","today"].includes(state.key))return false;
      if(settings.deadline==="3d"&&!["overdue","today","urgent"].includes(state.key))return false;
      if(settings.deadline==="7d"&&(state.days==null||state.days>7))return false;
      return [row.title,row.customer,row.platform,row.procedureNumber,row.owner,row.sourceName,row.nextActionText].filter(Boolean).join(" ").toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU"));
    });
    const field=(row:TenderRow):string|number|null=>{
      switch(settings.sort){
        case "identity":return row.title;case "customer":return row.customer;case "commerce":return numeric(row.initialPrice);
        case "deadline":case "remaining":return dateNumber(row.submissionDeadline);case "stage":return tenderStages.findIndex(stage=>stage.code===row.stage);
        case "blockers":return row.blockerCount;case "owner":return row.owner;case "platform":return row.platform;case "procedure":return row.procedureNumber;
        case "decision":return tenderDecisionLabels[row.decision]??null;case "potential":return tenderPotentialLabels[row.potential]??null;
        case "billing":return tenderBillingLabels[row.billingUnit]??null;case "source":return row.sourceName;case "publication":return dateNumber(row.publicationDate);
        case "roles":return row.roleCount;case "calculations":return row.calculationCount;case "action":return row.nextActionText;case "result":return row.result?tenderResultLabels[row.result]??null:null;
        default:return dateNumber(row.updatedAt);
      }
    };
    return result.sort((a,b)=>{const left=field(a),right=field(b);if(left===null||right===null)return left===right?a.id.localeCompare(b.id):left===null?1:-1;
      const comparison=typeof left==="number"&&typeof right==="number"?left-right:String(left).localeCompare(String(right),"ru");return (settings.direction==="asc"?comparison:-comparison)||a.id.localeCompare(b.id);});
  },[items,settings,query,currentDate]);
  const columns=orderedRegistryColumns(tenderColumns,settings);
  const columnWidth=(id:TenderColumnId)=>settings.widths[id]??tenderColumns.find(column=>column.id===id)!.width;
  const pinnedStyle=(id:TenderColumnId)=>settings.pinned.includes(id)?{left:registryPinnedOffset(id,tenderColumns,settings)}:undefined;
  const stages=tenderStages.filter(stage=>(settings.bucket==="completed"?stage.code==="completed":stage.code!=="completed")&&(!settings.stage||stage.code===settings.stage)&&(!settings.hideEmpty||filtered.some(row=>row.stage===stage.code)));
  const resetFilters=()=>{setQuery("");update({stage:"",owner:"",customer:"",platform:"",source:"",decision:"",deadline:"all"});};
  const hasFilters=Boolean(query||settings.stage||settings.owner||settings.customer||settings.platform||settings.source||settings.decision||settings.deadline!=="all");
  async function exportExcel(){
    const XLSX=await import("xlsx");
    const safe=(value:string|null)=>{const text=value??"";return /^[=+\-@\t\r]/.test(text)?`'${text}`:text;};
    const data=filtered.map(row=>({"Название":safe(row.title),"Заказчик":safe(row.customer),"Площадка":safe(row.platform),"Номер торга":safe(row.procedureNumber),"Ссылка":safe(row.sourceUrl),"Дата публикации":formatDate(row.publicationDate),"Срок":formatDate(row.submissionDeadline),"Цена в ₽":numeric(row.initialPrice)??"","Этап":tenderStageLabel(row.stage),"Решение":tenderDecisionLabels[row.decision]??"Уточняется","Ответственный":safe(row.owner),"Следующее действие":safe(row.nextActionText),"Источник":safe(row.sourceName),"Блокеры":row.blockerCount,"Результат":row.result?tenderResultLabels[row.result]??"Уточняется":""}));
    const sheet=XLSX.utils.json_to_sheet(data);sheet["!cols"]=[{wch:48},{wch:28},{wch:20},{wch:20},{wch:48},{wch:22},{wch:22},{wch:16},{wch:18},{wch:18},{wch:24},{wch:34},{wch:26}];
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Тендеры");XLSX.writeFile(book,"OPERIS_тендеры.xlsx");
  }
  function mayEdit(row:TenderRow){return !demo&&canEdit&&editable.has(row.id)&&row.stage!=="completed";}
  async function move(row:TenderRow,stage:string){
    if(busyId||!mayEdit(row)||stage==="completed"||(stage==="submitted"&&!canSubmit)||row.stage===stage)return;
    setBusyId(row.id);setError("");
    try{const response=await fetch(`/api/tenders/${row.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"stage",stage})});
      if(!response.ok){const json=await response.json().catch(()=>({}));throw new Error(json.error??"Не удалось изменить этап");}router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось изменить этап");}finally{setBusyId(null);}
  }
  function renderCell(row:TenderRow,column:TenderColumnId):ReactNode {
    const deadline=tenderDeadlineState(row.submissionDeadline,currentDate);
    switch(column){
      case "identity":return <><SalesRecordTitle title={row.title} onPreview={()=>setSelectedId(row.id)}/><span className="cell-sub">{[row.platform,row.procedureNumber].filter(Boolean).join(" · ")||"Площадка не указана"}</span></>;
      case "customer":return <><span title={row.customer}>{row.customer}</span><span className="cell-sub">{row.sourceName??"Источник не указан"}</span></>;
      case "commerce":return <><strong>{numeric(row.initialPrice)===null?"Цена не указана":rub(row.initialPrice!)}</strong><span className="cell-sub">{tenderBillingLabels[row.billingUnit]??"Формат уточняется"} · {tenderPotentialLabels[row.potential]??"Потенциал уточняется"}</span></>;
      case "deadline":return <><strong>{formatDate(row.submissionDeadline)}</strong><span className="cell-sub">{row.roleCount?`Позиции: ${row.roleCount}`:"Позиции не разобраны"}{row.calculationCount?` · расчётов: ${row.calculationCount}`:""}</span></>;
      case "remaining":return <span className={`tender-deadline ${deadlineClass(deadline.key)}`}><CalendarClock size={13}/>{deadline.label}</span>;
      case "stage":return <><TenderStatus row={row}/><span className="cell-sub">{tenderDecisionLabels[row.decision]??"Решение уточняется"}</span></>;
      case "blockers":return row.blockerCount>0?<><strong className="tender-blocker-count">{row.blockerCount}</strong><span className="cell-sub">по документам</span></>:"—";
      case "owner":return <>{row.owner??"Не назначен"}<span className="cell-sub" title={row.nextActionText??undefined}>{row.nextActionText??"Нет следующего действия"}</span></>;
      case "platform":return row.platform??"—";case "procedure":return row.procedureNumber??"—";case "decision":return tenderDecisionLabels[row.decision]??"Уточняется";
      case "potential":return tenderPotentialLabels[row.potential]??"Уточняется";case "billing":return tenderBillingLabels[row.billingUnit]??"Уточняется";
      case "source":return row.sourceName??"—";case "publication":return formatDate(row.publicationDate);case "roles":return row.roleCount;case "calculations":return row.calculationCount;
      case "action":return row.nextActionText??"—";case "updated":return formatDate(row.updatedAt);case "result":return row.result?tenderResultLabels[row.result]??"Уточняется":"—";
    }
  }
  function renderRows(groupRows:TenderRow[],level=0,path:string[]=[]):ReactNode {
    const field:TenderGroupId=level===0?settings.group:level===1?settings.subgroup:"none";
    if(field==="none")return groupRows.map(row=><tr key={row.id}>{columns.map(column=><td key={column.id} style={pinnedStyle(column.id)} className={settings.pinned.includes(column.id)?"registry-pinned-cell":""}><div className="requests-cell-content">{renderCell(row,column.id)}</div></td>)}<td><SalesRecordActions title={row.title} onPreview={()=>setSelectedId(row.id)} href={tenderHref(row)} onOpen={()=>snapshot(row)}/></td></tr>);
    const groups=new Map<string,{label:string;rows:TenderRow[]}>();
    for(const row of groupRows){const key=field==="owner"?row.ownerUserId??"unassigned":field==="customer"?tenderCustomerKey(row):field==="platform"?row.platform??"none":field==="decision"?row.decision:row.stage;
      const label=field==="owner"?row.owner??"Не назначен":field==="customer"?row.customer:field==="platform"?row.platform??"Площадка не указана":field==="decision"?tenderDecisionLabels[row.decision]??"Уточняется":tenderStages.find(stage=>stage.code===row.stage)?.label??"Этап уточняется";
      if(!groups.has(key))groups.set(key,{label,rows:[]});groups.get(key)!.rows.push(row);}
    return [...groups].map(([id,group])=>{const nextPath=[...path,`${field}:${id}`],key=JSON.stringify(nextPath),collapsed=collapsedGroups.includes(key);
      return <Fragment key={key}><tr className="requests-group-row"><th colSpan={columns.length+1} scope="rowgroup"><button type="button" style={{paddingLeft:14+level*22}} aria-expanded={!collapsed} onClick={()=>setCollapsedGroups(current=>collapsed?current.filter(item=>item!==key):[...current,key])}><ChevronRight size={14} className={collapsed?"":"expanded"}/>{group.label}<small>{group.rows.length} тенд.</small></button></th></tr>{!collapsed&&renderRows(group.rows,level+1,nextPath)}</Fragment>;});
  }
  return <div className="requests-registry request-baseline-registry tender-registry">
    <div className="sales-toolbar requests-registry-toolbar">
      <SalesSegments<View> label="Вид тендеров" value={view} variant="navigation" onChange={value=>{setView(value);router.replace(value==="list"?"/tenders":`/tenders?view=${value}`,{scroll:false});}} items={[{value:"list",label:"Таблица",icon:<LayoutList size={15}/>},{value:"board",label:"Доска",icon:<Columns3 size={15}/>},{value:"analytics",label:"Аналитика",icon:<ChartNoAxesCombined size={15}/>}]}/>
      <div className="sales-toolbar-actions"><button className="button" type="button" onClick={()=>void exportExcel()}><Download size={14}/> Выгрузить Excel</button>{canImport&&<TenderImportPanel canImport={canImport} demo={demo} onDemoImport={addDemoRows}/>}{canCreate&&<Link className="button primary" href="/tenders/new"><Plus size={14}/> Добавить тендер</Link>}</div>
    </div>
    {demo&&<p className="tender-demo-notice" role="note">Демонстрационные данные. Добавление, импорт и редактирование доступны для проверки интерфейса; локальные изменения не записываются в рабочую базу. В аналитике локальные изменения не учитываются.</p>}
    {error&&<div className="inline-message danger" role="alert">{error}<button className="icon-button" aria-label="Скрыть ошибку" onClick={()=>setError("")}><X size={15}/></button></div>}
    {view!=="analytics"&&<>
      <TenderRegistryControls {...preferences} rows={items} options={options} query={query} onQuery={setQuery} onExpandGroups={()=>setCollapsedGroups([])} board={view==="board"}/>
      <div className="sales-results" aria-live="polite">Показано {filtered.length}{hasFilters&&<button className="button" onClick={resetFilters}><RotateCcw size={13}/> Сбросить фильтры</button>}</div>
      {!filtered.length?<SalesEmpty title="Тендеры не найдены" text={hasFilters?"Измените условия поиска или сбросьте фильтры.":"В выбранном виде пока нет тендеров."} onReset={hasFilters?resetFilters:undefined}/>:view==="list"?<div key="tender-table" ref={tableRef} className="sales-table-wrap"><table className="data-table sales-request-table tender-table" style={{width:88+columns.reduce((sum,column)=>sum+columnWidth(column.id),0)}}><colgroup>{columns.map(column=><col key={column.id} style={{width:columnWidth(column.id)}}/>)}<col style={{width:88}}/></colgroup><thead><tr>{columns.map(column=><th key={column.id} scope="col" aria-label={column.label} style={pinnedStyle(column.id)} className={settings.pinned.includes(column.id)?"registry-pinned-cell":""} aria-sort={settings.sort===column.id?settings.direction==="asc"?"ascending":"descending":"none"}><button className="requests-column-sort" type="button" onClick={()=>update({sort:column.id,direction:settings.sort===column.id&&settings.direction==="asc"?"desc":"asc"})}><span>{column.label}</span><ArrowDownUp size={12}/></button><span className="requests-column-resize" role="separator" aria-label={`Ширина: ${column.label}`} aria-orientation="vertical" aria-valuemin={110} aria-valuemax={480} aria-valuenow={columnWidth(column.id)} tabIndex={0} onPointerDown={event=>{event.preventDefault();resizing.current={id:column.id,x:event.clientX,width:columnWidth(column.id)};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{const drag=resizing.current;if(drag?.id===column.id)update({widths:{...settings.widths,[column.id]:registryWidth(drag.width+event.clientX-drag.x)}});}} onPointerUp={()=>{resizing.current=null;}} onPointerCancel={()=>{resizing.current=null;}} onLostPointerCapture={()=>{resizing.current=null;}} onKeyDown={event=>{if(["ArrowLeft","ArrowRight"].includes(event.key)){event.preventDefault();update({widths:{...settings.widths,[column.id]:registryWidth(columnWidth(column.id)+(event.key==="ArrowLeft"?-10:10))}});}}}/></th>)}<th scope="col"><span className="sales-sr-only">Действия</span></th></tr></thead><tbody>{renderRows(filtered)}</tbody></table></div>:<div key="tender-board" ref={boardRef} className="sales-board requests-board tender-board" aria-label="Доска тендеров">{stages.map(stage=>{
        const stageRows=filtered.filter(row=>row.stage===stage.code),dropAllowed=!demo&&canEdit&&!busyId&&stage.code!=="completed"&&(stage.code!=="submitted"||canSubmit);
        return <section className="sales-board-column" key={stage.code} onDragOver={event=>{if(dropAllowed)event.preventDefault();}} onDrop={event=>{if(!dropAllowed)return;event.preventDefault();const row=items.find(item=>item.id===event.dataTransfer.getData("text/tender-id"));if(row)void move(row,stage.code);}}><header><TenderStageBadge stage={stage}/><b>{stageRows.length}</b></header><div className="sales-board-cards">{stageRows.map(row=>{const deadline=tenderDeadlineState(row.submissionDeadline,currentDate);return <article key={row.id} className="sales-board-card tender-board-card" aria-busy={busyId===row.id} draggable={mayEdit(row)&&!busyId} onDragStart={event=>event.dataTransfer.setData("text/tender-id",row.id)}>
          <div className="sales-card-heading"><SalesRecordTitle title={row.title} onPreview={()=>setSelectedId(row.id)}/><SalesRecordActions title={row.title} onPreview={()=>setSelectedId(row.id)} href={tenderHref(row)} onOpen={()=>snapshot(row)}/></div><p>{row.customer}</p><div className="tender-card-finance"><span>{numeric(row.initialPrice)===null?"Цена не указана":rub(row.initialPrice!)}</span></div><span className="tender-card-decision">{tenderDecisionLabels[row.decision]??"Решение уточняется"}</span><div className="sales-card-facts"><span className={`tender-deadline ${deadlineClass(deadline.key)}`}><CalendarClock size={13}/>{deadline.label}</span><span>{formatDate(row.submissionDeadline)}</span></div>{row.nextActionText&&<p className="tender-card-action">{row.nextActionText}</p>}<footer><span>{row.owner??"Не назначен"}</span>{row.blockerCount>0&&<small className="tender-blocker-count">{row.blockerCount} блок.</small>}</footer>
        </article>;})}{!stageRows.length&&<div className="sales-board-empty">Нет тендеров</div>}</div></section>;})}</div>}
      <HorizontalScrollDock scrollRef={view==="list"?tableRef:boardRef} disabled={Boolean(selected||demoEditing)||!filtered.length} revision={`${view}:${settings.columns.join(",")}:${settings.group}:${settings.subgroup}:${filtered.map(row=>row.id).join(",")}`} label={view==="list"?"Горизонтальная прокрутка тендеров":"Горизонтальная прокрутка доски тендеров"}/>
    </>}
    {view==="analytics"&&<TenderAnalytics data={analytics} options={options} metricPreferences={metricPreferences} canConfigure={canConfigureAnalytics} demo={demo}/>}
    {selected&&<SalesDrawer title={selected.title} subtitle={selected.customer} onClose={()=>setSelectedId(null)} footer={<><button className="button" type="button" onClick={()=>setSelectedId(null)}>Закрыть</button>{mayEdit(selected)&&<Link className="button" href={`/tenders/${selected.id}?edit=1`} onClick={()=>setSelectedId(null)}><Pencil size={14}/> Редактировать</Link>}{demo&&canEdit&&<button className="button" type="button" onClick={()=>{setDemoEditing(selected);setSelectedId(null)}}><Pencil size={14}/> Редактировать</button>}{<Link className="button primary" href={tenderHref(selected)} onClick={()=>{snapshot(selected);setSelectedId(null)}}>Открыть карточку<ArrowUpRight size={15}/></Link>}</>}>
      <section className="tender-preview-section"><h3>Состояние и подача</h3><TenderStatus row={selected}/><dl className="tender-preview-facts"><div><dt>Решение</dt><dd>{tenderDecisionLabels[selected.decision]??"Уточняется"}</dd></div><div><dt>Подача до</dt><dd>{formatDate(selected.submissionDeadline)}</dd></div><div><dt>Срок</dt><dd>{tenderDeadlineState(selected.submissionDeadline,currentDate).label}</dd></div><div><dt>Ответственный</dt><dd>{selected.owner??"Не назначен"}</dd></div><div><dt>Следующее действие</dt><dd>{selected.nextActionText??"—"}</dd></div><div><dt>Дата действия</dt><dd>{formatDate(selected.nextActionAt)}</dd></div></dl></section>
      <section className="tender-preview-section"><h3>Условия закупки</h3><dl className="tender-preview-facts"><div><dt>Начальная цена</dt><dd>{numeric(selected.initialPrice)===null?"—":rub(selected.initialPrice!)}</dd></div><div><dt>Тарификация</dt><dd>{tenderBillingLabels[selected.billingUnit]??"Уточняется"}</dd></div><div><dt>Потенциал</dt><dd>{tenderPotentialLabels[selected.potential]??"Уточняется"}</dd></div><div><dt>Площадка</dt><dd>{selected.platform??"—"}</dd></div><div><dt>Номер торга</dt><dd>{selected.procedureNumber??"—"}</dd></div><div><dt>Источник</dt><dd>{selected.sourceName??"—"}</dd></div></dl>{sourceHref(selected.sourceUrl)&&<a className="button" href={sourceHref(selected.sourceUrl)!} target="_blank" rel="noreferrer">Закупка на площадке<ExternalLink size={14}/></a>}</section>
      <section className="tender-preview-section"><h3>Готовность</h3><dl className="tender-preview-facts"><div><dt>Позиции / расчёты</dt><dd>{selected.roleCount} / {selected.calculationCount}</dd></div><div><dt>Документы готовы</dt><dd>{selected.requirementCount?`${selected.readyRequirementCount} из ${selected.requirementCount}`:"Требования не заданы"}</dd></div><div><dt>Блокеры</dt><dd>{selected.blockerCount}</dd></div></dl>{selected.analysisSummary&&<p>{selected.analysisSummary}</p>}{selected.closeReason&&<p>{selected.closeReason}</p>}</section>
    </SalesDrawer>}
    {demoEditing&&<SalesDrawer title="Редактировать тендер" subtitle="Демонстрационная копия сохраняется в этой вкладке браузера." overline="Демонстрационный режим" onClose={()=>setDemoEditing(null)}
      footer={<><button className="button" type="button" onClick={()=>setDemoEditing(null)}>Отмена</button><button className="button primary" type="submit" form="demo-tender-edit-form">Сохранить изменения</button></>}>
      <form id="demo-tender-edit-form" className="client-create-form client-create-form-unified tender-demo-edit-form" onSubmit={saveDemoEdit}>
        <section className="client-form-section"><div className="client-form-section-head"><strong>Закупка</strong><span>Основные данные реестра и карточки.</span></div>
          <label><span>Название тендера <b>*</b></span><input name="title" required minLength={3} maxLength={300} defaultValue={demoEditing.title}/></label>
          <label><span>Заказчик</span><input name="customer" maxLength={300} defaultValue={demoEditing.customer}/></label>
          <label><span>Площадка</span><input name="platform" maxLength={160} defaultValue={demoEditing.platform??""}/></label>
          <label><span>Номер закупки</span><input name="procedureNumber" maxLength={180} defaultValue={demoEditing.procedureNumber??""}/></label>
          <label><span>Ссылка на закупку</span><input name="sourceUrl" type="url" maxLength={2000} defaultValue={demoEditing.sourceUrl??""}/></label>
          <label><span>Источник</span><input name="sourceName" maxLength={180} defaultValue={demoEditing.sourceName??""}/></label>
          <label><span>Дата публикации</span><input name="publicationDate" type="date" defaultValue={inputDate(demoEditing.publicationDate)}/></label>
          <label><span>Подача до (МСК)</span><input name="submissionDeadline" type="datetime-local" defaultValue={inputDateTime(demoEditing.submissionDeadline)}/></label>
          <label><span>НМЦК / начальная цена, ₽</span><input name="initialPrice" type="number" min="0" step="any" defaultValue={demoEditing.initialPrice??""}/></label>
        </section>
        <section className="client-form-section"><div className="client-form-section-head"><strong>Рабочее состояние</strong><span>Для проверки воронки можно менять этап и решение.</span></div>
          <label><span>Этап</span><select name="stage" defaultValue={demoEditing.stage}>{tenderStages.map(stage=><option key={stage.code} value={stage.code}>{stage.label}</option>)}</select></label>
          <label><span>Решение</span><select name="decision" defaultValue={demoEditing.decision}><option value="undecided">Не определено</option><option value="participate">Участвуем</option><option value="needs_clarification">Нужно уточнение</option><option value="no_bid">Не участвуем</option></select></label>
          <label><span>Приоритет</span><select name="priority" defaultValue={demoEditing.priority}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option></select></label>
          <label><span>Потенциал</span><select name="potential" defaultValue={demoEditing.potential}><option value="low">Низкий</option><option value="medium">Средний</option><option value="high">Высокий</option></select></label>
          <label><span>Следующее действие</span><input name="nextActionText" maxLength={1000} defaultValue={demoEditing.nextActionText??""}/></label>
          <label><span>Аналитическая заметка</span><textarea name="analysisSummary" maxLength={12000} defaultValue={demoEditing.analysisSummary??""}/></label>
        </section>
        <p className="client-demo-note">В рабочем контуре изменения сохраняются через API и права доступа. Здесь изменения сохраняются в текущей вкладке браузера для проверки интерфейса.</p>
      </form>
    </SalesDrawer>}
  </div>;
}
