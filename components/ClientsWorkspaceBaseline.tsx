"use client";

import Link from "next/link";
import {Fragment,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {ArrowDown,ArrowUp,ArrowUpRight,ChevronDown,ChevronRight,Columns3,Download,Filter,Layers3,Pencil,Search,Settings2,X} from "lucide-react";
import type {ClientRow} from "@/lib/data/service";
import {normalizeRegistryLayout} from "@/lib/ui/registry-layout";
import {RegistryColumnControls} from "@/components/registry/RegistryColumnControls";
import {RegistryGroupingControls} from "@/components/registry/RegistryGroupingControls";
import {HorizontalScrollDock} from "@/components/registry/HorizontalScrollDock";
import {CreateClientButton,type DemoClientDraft} from "@/components/forms/CreateClientButton";
import {SalesDrawer} from "@/components/sales/SalesUI";

type ColumnId="client"|"status"|"owner"|"contact"|"requests"|"objects"|"region"|"inn"|"legalName"|"contacts"|"latestRequest"|"team";
type GroupId=""|"owner"|"region"|"status"|"team";
type TabId="all"|"active"|"inactive"|"archived";
type Column={id:ColumnId;label:string;width:number;required?:boolean};
type Filters={owner:string;region:string;status:string};
type Sort={id:ColumnId;asc:boolean};
type View={id:string;name:string;columns:ColumnId[];pinned:ColumnId[];widths:Partial<Record<ColumnId,number>>;group:GroupId;subgroup:GroupId;filters:Filters;tab:TabId;sort:Sort};

const COLUMNS:Column[]=[
  {id:"client",label:"Клиент",width:250,required:true},{id:"status",label:"Статус",width:126},{id:"owner",label:"Ответственный",width:168},
  {id:"contact",label:"Основной контакт",width:210},{id:"requests",label:"Заявки",width:110},{id:"objects",label:"Объекты",width:138},
  {id:"region",label:"Регион",width:190},{id:"inn",label:"ИНН",width:138},{id:"legalName",label:"Юридическое наименование",width:250},
  {id:"contacts",label:"Контакты",width:112},{id:"latestRequest",label:"Последняя заявка",width:250},{id:"team",label:"Команда",width:180},
];
const GROUPS:{id:GroupId;label:string}[]=[{id:"",label:"Без группировки"},{id:"owner",label:"Ответственный"},{id:"region",label:"Регион"},{id:"status",label:"Статус"},{id:"team",label:"Команда"}];
const TABS:{id:TabId;label:string}[]=[{id:"all",label:"Все клиенты"},{id:"active",label:"Активные"},{id:"inactive",label:"Неактивные"},{id:"archived",label:"Архив"}];
const EMPTY_FILTERS:Filters={owner:"",region:"",status:""};
const DEFAULT_SORT:Sort={id:"client",asc:true};
const BASE:View={id:"main",name:"Основной",columns:["client","status","owner","contact","requests","objects","region"],pinned:["client"],widths:{},group:"",subgroup:"",filters:EMPTY_FILTERS,tab:"all",sort:DEFAULT_SORT};
const PRESETS:View[]=[
  BASE,
  {...BASE,id:"commercial",name:"Коммерческий контур",columns:["client","status","owner","latestRequest","requests","objects","region"]},
  {...BASE,id:"contacts",name:"Контакты",columns:["client","contact","contacts","owner","region"]},
  {...BASE,id:"legal",name:"Реквизиты",columns:["client","legalName","inn","status","owner","region"]},
];

function statusLabel(value:string){const labels:Record<string,string>={active:"Активен",inactive:"Неактивен",archived:"Архив",blocked:"Заблокирован"};return labels[value]??(/[A-Za-z_]/.test(value)?"Другой статус":value)}
function tone(value:string):"good"|"warn"|"bad"|"neutral"{return value==="active"?"good":value==="blocked"?"bad":value==="inactive"?"warn":"neutral"}
function matchesTab(row:ClientRow,tab:TabId){if(tab==="all")return true;if(tab==="active")return row.status==="active";if(tab==="archived")return row.status==="archived";return row.status!=="active"&&row.status!=="archived"}
function value(row:ClientRow,id:ColumnId):string{switch(id){case"client":return row.name;case"status":return statusLabel(row.status);case"owner":return row.ownerName??"Не назначен";case"contact":return row.primaryContactName??"Не указан";case"requests":return String(row.requests);case"objects":return String(row.activeObjects)+"/"+String(row.objects);case"region":return row.region??"Не указан";case"inn":return row.inn??"—";case"legalName":return row.legalName??"—";case"contacts":return String(row.contacts);case"latestRequest":return row.latestRequestTitle??"—";case"team":return row.teamName??"Не назначена"}}
function numeric(row:ClientRow,id:ColumnId){return id==="requests"?row.requests:id==="contacts"?row.contacts:id==="objects"?row.activeObjects:null}
function ephemeral(row:ClientRow){return row.organizationId==="demo"}
function Dot({status}:{status:string}){return <span className={"operis-status "+tone(status)}><i/>{statusLabel(status)}</span>}
function safeView(input:unknown):View|null{
  if(!input||typeof input!=="object")return null;const source=input as Partial<View>;if(typeof source.id!=="string"||typeof source.name!=="string")return null;
  const layout=normalizeRegistryLayout(source,COLUMNS,BASE);const group=GROUPS.some(item=>item.id===source.group)?source.group!:"";const subgroup=GROUPS.some(item=>item.id===source.subgroup)&&source.subgroup!==group?source.subgroup!:"";
  const filters:Filters={...EMPTY_FILTERS};for(const key of Object.keys(filters) as (keyof Filters)[]){const raw=source.filters?.[key];if(typeof raw==="string")filters[key]=raw.slice(0,200)}
  const tab=TABS.some(item=>item.id===source.tab)?source.tab!:"all";const sort:Sort=source.sort&&COLUMNS.some(column=>column.id===source.sort?.id)?{id:source.sort.id,asc:source.sort.asc!==false}:{...DEFAULT_SORT};
  return {id:source.id.slice(0,80),name:source.name.slice(0,40),...layout,group,subgroup,filters,tab,sort};
}
function exportCsv(rows:ClientRow[],columns:Column[]){const esc=(raw:string)=>'"'+(/^[=+\-@\t\r]/.test(raw)?"'":"")+raw.replace(/"/g,'""')+'"';const body=[columns.map(c=>esc(c.label)).join(";"),...rows.map(r=>columns.map(c=>esc(value(r,c.id))).join(";"))].join("\r\n");const url=URL.createObjectURL(new Blob(["\uFEFF"+body],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="operis-clients.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

export function ClientsWorkspaceBaseline({rows,canCreate=false,demo=false,preferenceScope="default"}:{rows:ClientRow[];canCreate?:boolean;demo?:boolean;preferenceScope?:string}){
  const [demoRows,setDemoRows]=useState<ClientRow[]>([]),key="operis:clients:views:v1:"+preferenceScope;
  const localRows=useMemo(()=>{const overrides=new Set(demoRows.map(row=>row.id));return [...demoRows,...rows.filter(row=>!overrides.has(row.id))]},[demoRows,rows]);
  const [view,setView]=useState<View>(BASE),[custom,setCustom]=useState<View[]>([]),[loadedKey,setLoadedKey]=useState<string|null>(null),[storageError,setStorageError]=useState("");
  const [query,setQuery]=useState(""),[tab,setTab]=useState<TabId>("all"),[filters,setFilters]=useState<Filters>(EMPTY_FILTERS),[sort,setSort]=useState<Sort>(DEFAULT_SORT);
  const [popup,setPopup]=useState<""|"views"|"columns"|"groups"|"filters">(""),[viewName,setViewName]=useState(""),[collapsed,setCollapsed]=useState<Set<string>>(new Set()),[quick,setQuick]=useState<ClientRow|null>(null),[demoEditing,setDemoEditing]=useState<ClientRow|null>(null);
  const wrapper=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null);

  useEffect(()=>{let cancelled=false;queueMicrotask(()=>{if(cancelled)return;let current:View=BASE,saved:View[]=[];try{const raw=JSON.parse(localStorage.getItem(key)??"null");current=safeView(raw?.current)??BASE;saved=Array.isArray(raw?.custom)?raw.custom.map((item:unknown)=>safeView(item)).filter((item:View|null):item is View=>Boolean(item)).slice(0,20):[]}catch{}setView(current);setCustom(saved);setFilters(current.filters);setTab(current.tab);setSort(current.sort);setLoadedKey(key)});return()=>{cancelled=true}},[key]);
  useEffect(()=>{if(loadedKey!==key)return;try{localStorage.setItem(key,JSON.stringify({current:{...view,filters,tab,sort},custom}))}catch{setTimeout(()=>setStorageError("Настройки действуют до закрытия вкладки: браузер не разрешил сохранение."),0)}},[view,filters,tab,sort,custom,key,loadedKey]);
  useEffect(()=>{const click=(event:MouseEvent)=>{if(!wrapper.current?.contains(event.target as Node))setPopup("")};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setPopup("")};document.addEventListener("mousedown",click);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("mousedown",click);document.removeEventListener("keydown",escape)}},[]);

  const columns=useMemo(()=>{const selected=view.columns.map(id=>COLUMNS.find(c=>c.id===id)).filter((c):c is Column=>Boolean(c));return [...selected.filter(c=>view.pinned.includes(c.id)),...selected.filter(c=>!view.pinned.includes(c.id))]},[view]);
  const widths=columns.map(c=>view.widths[c.id]??c.width),tableWidth=widths.reduce((a,b)=>a+b,0)+48;
  const searched=useMemo(()=>localRows.filter(row=>{const needle=query.trim().toLocaleLowerCase("ru"),text=[row.name,row.legalName,row.inn,row.ownerName,row.region,row.primaryContactName,row.primaryContactPhone,row.primaryContactEmail,row.latestRequestTitle,row.teamName].filter(Boolean).join(" ").toLocaleLowerCase("ru");return(!needle||text.includes(needle))&&(!filters.owner||value(row,"owner")===filters.owner)&&(!filters.region||value(row,"region")===filters.region)&&(!filters.status||row.status===filters.status)}),[localRows,query,filters]);
  const filtered=useMemo(()=>searched.filter(row=>matchesTab(row,tab)).sort((a,b)=>{const an=numeric(a,sort.id),bn=numeric(b,sort.id);const cmp=an!=null&&bn!=null?(an===bn?0:an<bn?-1:1):value(a,sort.id).localeCompare(value(b,sort.id),"ru",{numeric:true});return sort.asc?cmp:-cmp}),[searched,tab,sort]);
  const choices=(id:"owner"|"region"|"status")=>Array.from(new Set(localRows.map(row=>id==="status"?row.status:value(row,id)))).sort((a,b)=>a.localeCompare(b,"ru"));
  const applyView=(candidate:View)=>{const next=safeView(candidate)??BASE;setView(next);setFilters(next.filters);setTab(next.tab);setSort(next.sort);setCollapsed(new Set());setPopup("")};
  const changePopup=(next:typeof popup)=>setPopup(current=>current===next?"":next);
  const sticky=(column:Column)=>view.pinned.includes(column.id)?{position:"sticky" as const,left:columns.slice(0,columns.indexOf(column)).filter(c=>view.pinned.includes(c.id)).reduce((sum,c)=>sum+(view.widths[c.id]??c.width),0),zIndex:2}:{};
  function resize(event:React.PointerEvent,column:Column){event.preventDefault();event.stopPropagation();const node=event.currentTarget as HTMLElement,start=event.clientX,initial=view.widths[column.id]??column.width;node.setPointerCapture(event.pointerId);const move=(e:PointerEvent)=>setView(current=>({...current,widths:{...current.widths,[column.id]:Math.max(110,Math.min(480,initial+e.clientX-start))}}));const end=()=>{node.removeEventListener("pointermove",move);node.removeEventListener("pointerup",end);node.removeEventListener("pointercancel",end)};node.addEventListener("pointermove",move);node.addEventListener("pointerup",end);node.addEventListener("pointercancel",end)}
  function createDemo(draft:DemoClientDraft){const hasContact=Boolean(draft.contactName||draft.contactPhone||draft.contactEmail);const row:ClientRow={id:crypto.randomUUID(),organizationId:"demo",name:draft.name,legalName:draft.legalName,inn:draft.inn,status:"active",contacts:hasContact?1:0,requests:0,objects:0,activeObjects:0,ownerName:"Текущий пользователь",region:null,teamName:"Продажи",primaryContactName:draft.contactName,primaryContactPhone:draft.contactPhone,primaryContactEmail:draft.contactEmail,latestRequestId:null,latestRequestTitle:null};setDemoRows(current=>[row,...current]);setQuick(row)}
  function saveDemoEdit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!demoEditing)return;const fd=new FormData(event.currentTarget);
    const next:ClientRow={...demoEditing,
      name:String(fd.get("name")??"").trim(),
      legalName:String(fd.get("legalName")??"").trim()||null,
      inn:String(fd.get("inn")??"").trim()||null,
      status:String(fd.get("status")??demoEditing.status),
      primaryContactName:String(fd.get("contactName")??"").trim()||null,
      primaryContactPhone:String(fd.get("contactPhone")??"").trim()||null,
      primaryContactEmail:String(fd.get("contactEmail")??"").trim()||null,
    };
    next.contacts=next.primaryContactName||next.primaryContactPhone||next.primaryContactEmail?Math.max(1,next.contacts):next.contacts;
    setDemoRows(current=>[next,...current.filter(row=>row.id!==next.id)]);setDemoEditing(null);setQuick(next);
  }

  function renderCell(row:ClientRow,column:Column){
    if(column.id==="client")return <button className="operis-client-name" type="button" onClick={()=>setQuick(row)}><span><strong>{row.name}</strong><small>{row.legalName??"Юридическое наименование не указано"}</small></span></button>;
    if(column.id==="status")return <Dot status={row.status}/>;
    if(column.id==="contact")return <span><strong className="operis-cell-main">{row.primaryContactName??"—"}</strong><small className="operis-cell-sub">{row.primaryContactPhone??row.primaryContactEmail??"Контакт не указан"}</small></span>;
    if(column.id==="requests")return ephemeral(row)?<span className="operis-number-link">{row.requests}</span>:<Link className="operis-cell-link operis-number-link" href={"/clients/"+row.id+"?tab=requests"}>{row.requests}</Link>;
    if(column.id==="objects")return ephemeral(row)?<span><strong className="operis-cell-main">{row.activeObjects} / {row.objects}</strong><small className="operis-cell-sub">активные / всего</small></span>:<Link className="operis-cell-link" href={"/clients/"+row.id+"?tab=objects"}><strong className="operis-cell-main">{row.activeObjects} / {row.objects}</strong><small className="operis-cell-sub">активные / всего</small></Link>;
    if(column.id==="contacts")return ephemeral(row)?<span className="operis-number-link">{row.contacts}</span>:<Link className="operis-cell-link operis-number-link" href={"/clients/"+row.id+"?tab=contacts"}>{row.contacts}</Link>;
    if(column.id==="latestRequest")return row.latestRequestId?<Link className="operis-cell-link" href={"/requests/"+row.latestRequestId}>{row.latestRequestTitle}</Link>:<span>—</span>;
    return <span title={value(row,column.id)}>{value(row,column.id)}</span>;
  }
  const renderRow=(row:ClientRow)=><tr key={row.id} onClick={event=>{if(!(event.target as HTMLElement).closest("a,button,input,select"))setQuick(row)}}>{columns.map(column=><td key={column.id} style={sticky(column)}>{renderCell(row,column)}</td>)}<td className="operis-actions-cell">{ephemeral(row)?<button className="icon-button" type="button" onClick={()=>setQuick(row)} aria-label={"Просмотр: "+row.name}><ArrowUpRight size={16}/></button>:<Link className="icon-button" href={"/clients/"+row.id} aria-label={"Открыть карточку: "+row.name}><ArrowUpRight size={16}/></Link>}</td></tr>;
  function renderGroups(items:ClientRow[],level=0,path=""):React.ReactNode{const group=level===0?view.group:view.subgroup;if(!group)return items.map(renderRow);const map=new Map<string,ClientRow[]>();for(const row of items){const label=value(row,group);map.set(label,[...(map.get(label)??[]),row])}return Array.from(map).map(([label,members])=>{const id=JSON.stringify([path,group,label]);return <Fragment key={id}><tr className="operis-group-row"><td colSpan={columns.length+1}><button style={{paddingLeft:level?32:12}} aria-expanded={!collapsed.has(id)} onClick={()=>setCollapsed(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})}><ChevronRight size={16} className={collapsed.has(id)?"":"is-open"}/><span>{label}</span><small>{members.length}</small></button></td></tr>{!collapsed.has(id)&&(level===0&&view.subgroup?renderGroups(members,1,id):members.map(renderRow))}</Fragment>})}

  return <div className="operis-worker-registry operis-client-registry" ref={wrapper}>
    <div className="operis-registry-crumb">Коммерция <ChevronRight size={12}/> Клиенты</div>
    <header className="operis-registry-header"><div><h1>Клиенты</h1><p>Компании, ответственные, контакты и связанный коммерческий контур</p></div><div className="operis-header-actions"><button className="button" type="button" onClick={()=>exportCsv(filtered,columns)}><Download size={15}/> Экспорт</button>{canCreate&&<CreateClientButton demo={demo} onDemoCreate={createDemo}/>}</div></header>
    <nav className="operis-registry-tabs" aria-label="Состояние клиентов">{TABS.map(item=><button key={item.id} type="button" className={tab===item.id?"active":""} aria-current={tab===item.id?"page":undefined} onClick={()=>setTab(item.id)}>{item.label}<span>{searched.filter(row=>matchesTab(row,item.id)).length}</span></button>)}</nav>
    <div className="operis-registry-toolbar"><label className="operis-registry-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Клиент, ИНН, контакт…" aria-label="Поиск клиентов"/>{query&&<button type="button" aria-label="Очистить поиск" onClick={()=>setQuery("")}><X size={14}/></button>}</label>
      <select aria-label="Быстрый фильтр по региону" value={filters.region} onChange={event=>setFilters(current=>({...current,region:event.target.value}))}><option value="">Все регионы</option>{choices("region").map(item=><option key={item}>{item}</option>)}</select>
      <button className={"button "+(popup==="filters"?"is-active":"")} type="button" onClick={()=>changePopup("filters")}><Filter size={15}/> Фильтры{Object.values(filters).filter(Boolean).length>0&&<span className="operis-count">{Object.values(filters).filter(Boolean).length}</span>}</button>
      <div className="operis-toolbar-spacer"/><button className="button" type="button" onClick={()=>changePopup("views")} aria-expanded={popup==="views"}><Layers3 size={15}/>{view.name}<ChevronDown size={14}/></button><button className="button" type="button" onClick={()=>changePopup("groups")}><Settings2 size={15}/> Группировка</button><button className="button" type="button" onClick={()=>changePopup("columns")}><Columns3 size={15}/> Колонки</button>
    </div>
    {Object.values(filters).some(Boolean)&&<div className="operis-filter-chips">{Object.entries(filters).filter(([,entry])=>entry).map(([filterKey,entry])=><button type="button" key={filterKey} onClick={()=>setFilters(current=>({...current,[filterKey]:""}))}>{filterKey==="status"?statusLabel(entry):entry}<X size={12}/></button>)}<button type="button" onClick={()=>setFilters(EMPTY_FILTERS)}>Сбросить фильтры</button></div>}
    {popup&&<section className={"operis-registry-popover "+popup} aria-label={popup==="columns"?"Настройка колонок":popup==="groups"?"Настройка группировки":popup==="views"?"Представления реестра":"Дополнительные фильтры"}><div className="operis-popover-head"><strong>{popup==="columns"?"Колонки таблицы":popup==="groups"?"Группировка":popup==="views"?"Представления":"Фильтры"}</strong><button className="icon-button" type="button" aria-label="Закрыть настройки" onClick={()=>setPopup("")}><X size={16}/></button></div>
      {popup==="columns"&&<RegistryColumnControls columns={COLUMNS} layout={view} onChange={layout=>setView(current=>({...current,...layout}))} onReset={()=>setView(current=>({...current,columns:BASE.columns,pinned:BASE.pinned,widths:{}}))}/>}
      {popup==="groups"&&<RegistryGroupingControls options={GROUPS} group={view.group} subgroup={view.subgroup} none="" onChange={grouping=>{setView(current=>({...current,...grouping}));setCollapsed(new Set())}} onExpand={()=>setCollapsed(new Set())}/>}
      {popup==="filters"&&<><label>Ответственный<select value={filters.owner} onChange={event=>setFilters(current=>({...current,owner:event.target.value}))}><option value="">Все</option>{choices("owner").map(item=><option key={item}>{item}</option>)}</select></label><label>Регион<select value={filters.region} onChange={event=>setFilters(current=>({...current,region:event.target.value}))}><option value="">Все</option>{choices("region").map(item=><option key={item}>{item}</option>)}</select></label><label>Статус<select value={filters.status} onChange={event=>setFilters(current=>({...current,status:event.target.value}))}><option value="">Все</option>{choices("status").map(item=><option key={item} value={item}>{statusLabel(item)}</option>)}</select></label></>}
      {popup==="views"&&<><p>Вид сохраняет фильтры, статус, сортировку, колонки, ширину, закрепление и группировку. Поиск не сохраняется.</p>{[...PRESETS,...custom].map(item=><div className="operis-view-option" key={item.id}><button type="button" aria-pressed={view.id===item.id} onClick={()=>applyView(item)}><Layers3 size={15}/>{item.name}{view.id===item.id&&<span>Выбран</span>}</button>{custom.some(saved=>saved.id===item.id)&&<button type="button" className="icon-button" aria-label={"Удалить вид "+item.name} onClick={()=>{setCustom(custom.filter(saved=>saved.id!==item.id));if(view.id===item.id)applyView(BASE)}}><X size={14}/></button>}</div>)}<form className="operis-save-view" onSubmit={event=>{event.preventDefault();if(!viewName.trim()||custom.length>=20)return;const saved={...view,filters:{...filters},tab,sort:{...sort},id:crypto.randomUUID(),name:viewName.trim().slice(0,40)};setCustom(current=>[...current,saved]);setView(saved);setViewName("")}}><label>Сохранить текущий вид<input required maxLength={40} placeholder="Например, мои клиенты" value={viewName} onChange={event=>setViewName(event.target.value)}/></label><button className="button primary" disabled={custom.length>=20}>Сохранить</button></form><small>Настройки сохраняются только в этом браузере для текущего рабочего пространства.</small></>}
    </section>}
    {storageError&&<p className="operis-storage-note">{storageError}</p>}<div className="operis-registry-result"><span>{filtered.length} из {localRows.length}</span><span>{view.group?"Группировка: "+GROUPS.find(item=>item.id===view.group)?.label:"Нажмите на строку для быстрого просмотра"}</span></div>
    <div className="operis-registry-table-wrap" ref={scroller}><table className="operis-registry-table operis-client-table" style={{width:Math.max(tableWidth,980)}}><colgroup>{columns.map((column,index)=><col key={column.id} style={{width:widths[index]}}/>)}<col style={{width:48}}/></colgroup><thead><tr>{columns.map(column=><th scope="col" aria-label={column.label} aria-sort={sort.id===column.id?(sort.asc?"ascending":"descending"):"none"} key={column.id} style={sticky(column)}><button type="button" onClick={()=>setSort({id:column.id,asc:sort.id===column.id?!sort.asc:true})}>{column.label}{sort.id===column.id&&(sort.asc?<ArrowUp size={12}/>:<ArrowDown size={12}/>)}</button><span className="operis-column-resize" onPointerDown={event=>resize(event,column)} title="Потяните для изменения ширины"/></th>)}<th scope="col" aria-label="Открыть"/></tr></thead><tbody>{renderGroups(filtered)}{!filtered.length&&<tr><td className="operis-empty" colSpan={columns.length+1}><Search size={24}/><strong>Клиенты не найдены</strong><span>Измените поиск или фильтры.</span><button className="button" type="button" onClick={()=>{setQuery("");setFilters(EMPTY_FILTERS);setTab("all")}}>Сбросить поиск и фильтры</button></td></tr>}</tbody></table></div>
    <HorizontalScrollDock scrollRef={scroller} disabled={Boolean(quick)} label="Горизонтальная прокрутка реестра клиентов" revision={tableWidth+":"+filtered.length+":"+view.group+":"+view.subgroup+":"+collapsed.size}/>
    {quick&&<SalesDrawer title={quick.name} subtitle={quick.legalName??"Юридическое наименование не указано"} overline="Быстрый просмотр клиента" onClose={()=>setQuick(null)} footer={<><button className="button" type="button" onClick={()=>setQuick(null)}>Закрыть</button>{demo&&<button className="button" type="button" onClick={()=>{setDemoEditing(quick);setQuick(null)}}><Pencil size={14}/> Редактировать</button>}{!demo&&!ephemeral(quick)&&<Link className="button primary" href={"/clients/"+quick.id}>Открыть карточку<ChevronRight size={15}/></Link>}</>}><div className="client-quick-status"><Dot status={quick.status}/></div><section className="client-quick-section"><h3>Основная информация</h3><dl><div><dt>Ответственный</dt><dd>{quick.ownerName??"Не назначен"}</dd></div><div><dt>Регион</dt><dd>{quick.region??"Не указан"}</dd></div><div><dt>ИНН</dt><dd>{quick.inn??"—"}</dd></div><div><dt>Команда</dt><dd>{quick.teamName??"Не назначена"}</dd></div></dl></section><section className="client-quick-section"><h3>Основной контакт</h3><dl><div><dt>Контакт</dt><dd>{quick.primaryContactName??"Не указан"}</dd></div><div><dt>Телефон</dt><dd>{quick.primaryContactPhone?<a href={"tel:"+quick.primaryContactPhone.replace(/[^+\d]/g,"")}>{quick.primaryContactPhone}</a>:"—"}</dd></div><div><dt>Эл. почта</dt><dd>{quick.primaryContactEmail?<a href={"mailto:"+quick.primaryContactEmail}>{quick.primaryContactEmail}</a>:"—"}</dd></div></dl></section>{ephemeral(quick)?<p className="client-demo-note">Демонстрационная запись существует только в текущем реестре. Связанные разделы появятся у сохранённого клиента.</p>:<section className="client-quick-section"><h3>Связанный контур</h3><div className="client-quick-links"><Link href={"/clients/"+quick.id+"?tab=requests"}><span>Заявки</span><strong>{quick.requests}</strong></Link><Link href={"/clients/"+quick.id+"?tab=objects"}><span>Объекты</span><strong>{quick.activeObjects} / {quick.objects}</strong></Link><Link href={"/clients/"+quick.id+"?tab=contacts"}><span>Контакты</span><strong>{quick.contacts}</strong></Link></div>{quick.latestRequestId&&<p className="client-quick-latest">Последняя заявка: <Link href={"/requests/"+quick.latestRequestId}>{quick.latestRequestTitle}</Link></p>}</section>}</SalesDrawer>}
    {demoEditing&&<SalesDrawer title="Редактировать клиента" subtitle="Демо-изменения действуют только в текущем открытом реестре." overline="Демонстрационный режим" onClose={()=>setDemoEditing(null)}
      footer={<><button className="button" type="button" onClick={()=>setDemoEditing(null)}>Отмена</button><button className="button primary" type="submit" form="demo-client-edit-form">Сохранить изменения</button></>}>
      <form id="demo-client-edit-form" className="client-create-form client-create-form-unified client-edit-form" onSubmit={saveDemoEdit}>
        <section className="client-form-section"><div className="client-form-section-head"><strong>Основные данные</strong><span>Изменения не записываются в рабочую БД.</span></div>
          <label><span>Рабочее название <b>*</b></span><input name="name" required minLength={2} maxLength={160} defaultValue={demoEditing.name}/></label>
          <label><span>Юридическое наименование</span><input name="legalName" maxLength={240} defaultValue={demoEditing.legalName??""}/></label>
          <label><span>ИНН</span><input name="inn" maxLength={20} defaultValue={demoEditing.inn??""}/></label>
          <label><span>Статус</span><select name="status" defaultValue={demoEditing.status}><option value="active">Активен</option><option value="inactive">Неактивен</option><option value="blocked">Заблокирован</option><option value="archived">Архив</option></select></label>
        </section>
        <section className="client-form-section"><div className="client-form-section-head"><strong>Основной контакт</strong><span>Для проверки реестра можно изменить отображаемый контакт.</span></div>
          <label><span>Контакт</span><input name="contactName" maxLength={180} defaultValue={demoEditing.primaryContactName??""}/></label>
          <label><span>Телефон</span><input name="contactPhone" type="tel" maxLength={80} defaultValue={demoEditing.primaryContactPhone??""}/></label>
          <label><span>Эл. почта</span><input name="contactEmail" type="email" maxLength={240} defaultValue={demoEditing.primaryContactEmail??""}/></label>
        </section>
        <p className="client-demo-note">Это только демонстрационная правка интерфейса. После перезагрузки страницы исходные демоданные восстановятся.</p>
      </form>
    </SalesDrawer>}
  </div>;
}
