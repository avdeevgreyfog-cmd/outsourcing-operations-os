"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Plus, Upload, X } from "lucide-react";
import { Status } from "@/components/UI";
import { SalesSearch } from "@/components/sales/SalesUI";
import type { WorkerRow } from "@/lib/data/service";
import type { OperationsReferenceData } from "@/lib/operations/service";
import { rub } from "@/lib/ui/format";
import { employmentTypeLabel,workerStatusLabel } from "@/lib/ui/labels";

type ImportRow={fullName:string;phone:string|null;email:string|null;city:string|null;birthDate:string|null;specialtyName:string|null;startDate:string|null;relationType:"employment"|"gph"|"npd"|"custom"|null;rate:number|null;rateUnit:"hour"|"shift"|"month"|null;workMode:"local"|"rotation"|null;paidHoursPerShift:number|null};
type FormState={fullName:string;phone:string;email:string;city:string;birthDate:string;objectId:string;specialtyId:string;startDate:string;relationType:"employment"|"gph"|"npd"|"custom";rate:string;rateUnit:"hour"|"shift"|"month";workMode:"local"|"rotation";paidHoursPerShift:string;clothingSize:string;shoeSize:string;heightCm:string;notes:string};
type WorkerView="operational"|"attention"|"compensation";
const today=()=>new Date().toISOString().slice(0,10);
const blank=():FormState=>({fullName:"",phone:"",email:"",city:"",birthDate:"",objectId:"",specialtyId:"",startDate:today(),relationType:"employment",rate:"",rateUnit:"hour",workMode:"local",paidHoursPerShift:"",clothingSize:"",shoeSize:"",heightCm:"",notes:""});

export function WorkersWorkspace({rows,options,sensitive,canEdit,demo}:{rows:WorkerRow[];options:OperationsReferenceData;sensitive:boolean;canEdit:boolean;demo:boolean}){
  const [query,setQuery]=useState("");
  const [view,setView]=useState<WorkerView>("operational");
  const [objectFilter,setObjectFilter]=useState("");
  const [managerFilter,setManagerFilter]=useState("");
  const [specialtyFilter,setSpecialtyFilter]=useState("");
  const [workModeFilter,setWorkModeFilter]=useState("");
  const [stateFilter,setStateFilter]=useState("");
  const [localRows,setLocalRows]=useState(rows);
  const [showCreate,setShowCreate]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [form,setForm]=useState<FormState>(blank());
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [importRows,setImportRows]=useState<ImportRow[]>([]);
  const [importObject,setImportObject]=useState(options.objects[0]?.id??"");
  const [importSpecialty,setImportSpecialty]=useState("");
  const [importStart,setImportStart]=useState(today());
  const [importWorkMode,setImportWorkMode]=useState<"local"|"rotation">("local");
  const [importPaidHours,setImportPaidHours]=useState("");
  const [importResult,setImportResult]=useState("");

  const objectOptions=useMemo(()=>[...new Set(localRows.map(row=>row.object).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,"ru")),[localRows]);
  const managerOptions=useMemo(()=>[...new Set(localRows.map(row=>row.managerName).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,"ru")),[localRows]);
  const specialtyOptions=useMemo(()=>[...new Set(localRows.map(row=>row.specialty).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,"ru")),[localRows]);
  const stateOptions=useMemo(()=>[...new Set(localRows.map(operationalState))].sort((a,b)=>a.localeCompare(b,"ru")),[localRows]);
  const hasFilters=Boolean(query||objectFilter||managerFilter||specialtyFilter||workModeFilter||stateFilter);
  const filtered=useMemo(()=>localRows.filter(row=>{
    const matchesQuery=`${row.fullName} ${row.object??""} ${row.managerName??""} ${row.specialty??""} ${row.source??""}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"));
    return matchesQuery
      &&(!objectFilter||row.object===objectFilter)
      &&(!managerFilter||row.managerName===managerFilter)
      &&(!specialtyFilter||row.specialty===specialtyFilter)
      &&(!workModeFilter||(row.workMode??"local")===workModeFilter)
      &&(!stateFilter||operationalState(row)===stateFilter)
      &&(view!=="attention"||workerNeedsAttention(row));
  }),[localRows,query,objectFilter,managerFilter,specialtyFilter,workModeFilter,stateFilter,view]);
  const groups=useMemo(()=>{
    const map=new Map<string,{name:string;rows:WorkerRow[]}>();
    for(const row of filtered){
      const name=row.managerName??"Менеджер не назначен";
      const group=map.get(name)??{name,rows:[]};group.rows.push(row);map.set(name,group);
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  },[filtered]);
  const totals=useMemo(()=>({
    working:localRows.filter(row=>row.status==="active"&&operationalState(row)==="Работает").length,
    absent:localRows.filter(row=>row.status==="active"&&operationalState(row)!=="Работает").length,
    changes:localRows.filter(row=>Boolean(row.plannedExitDate||row.plannedTransferDate)).length,
    attention:localRows.filter(workerNeedsAttention).length,
  }),[localRows]);

  async function createWorker(){
    setBusy(true);setError("");
    try{
      if(!form.fullName.trim())throw new Error("Укажите ФИО");
      if((form.objectId&&!form.specialtyId)||(!form.objectId&&form.specialtyId))throw new Error("Объект и специальность указываются вместе");
      if(demo){
        const object=options.objects.find(x=>x.id===form.objectId);
        const specialty=options.specialties.find(x=>x.id===form.specialtyId);
        setLocalRows(current=>[{id:crypto.randomUUID(),organizationId:"demo",fullName:form.fullName,status:"active",source:"Ручное создание",object:object?.name??null,objectId:object?.id,ownerUserId:object?.ownerUserId??undefined,assigneeUserIds:object?.assigneeUserIds??[],managerName:object?.ownerName??null,specialty:specialty?.name??null,specialtyId:specialty?.id??null,startDate:form.startDate,employment:form.relationType,workMode:form.workMode,paidHoursPerShift:form.paidHoursPerShift?Number(form.paidHoursPerShift):null,rate:form.rate?Number(form.rate):null,rateUnit:form.rateUnit,accrued:0,paid:0,payable:0},...current]);
      }else{
        const response=await fetch("/api/workers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
          ...form,phone:form.phone||null,email:form.email||null,city:form.city||null,birthDate:form.birthDate||null,
          objectId:form.objectId||null,specialtyId:form.specialtyId||null,rate:form.rate?Number(form.rate):null,paidHoursPerShift:form.paidHoursPerShift?Number(form.paidHoursPerShift):null,
          clothingSize:form.clothingSize||null,shoeSize:form.shoeSize||null,heightCm:form.heightCm?Number(form.heightCm):null,notes:form.notes||null,
        })});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось создать сотрудника");
        window.location.reload();
      }
      setShowCreate(false);setForm(blank());
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать сотрудника");}
    finally{setBusy(false);}
  }

  async function downloadTemplate(){
    const XLSX=await import("xlsx");
    const sheet=XLSX.utils.json_to_sheet([{"ФИО":"Иванов Иван Иванович","Телефон":"+7 900 000-00-00","Email":"","Город":"Тула","Дата рождения":"","Специальность":"Комплектовщик","Дата начала":today(),"Оформление":"employment","Формат работы":"local","Ставка":3900,"Единица ставки":"shift","Оплачиваемых часов в смене":11}]);
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Сотрудники");XLSX.writeFile(book,"operis_workers_import.xlsx");
  }

  async function readImportFile(file:File){
    setError("");setImportResult("");
    try{
      const XLSX=await import("xlsx");
      const workbook=XLSX.read(await file.arrayBuffer(),{type:"array"});
      const sheet=workbook.Sheets[workbook.SheetNames[0]];
      const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:""});
      const mapped=raw.map(mapImportRow).filter((row):row is ImportRow=>Boolean(row));
      if(!mapped.length)throw new Error("В файле нет строк сотрудников");
      setImportRows(mapped);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось прочитать Excel");setImportRows([]);}
  }

  async function runImport(){
    if(!importRows.length||!importObject)return;
    setBusy(true);setError("");setImportResult("");
    try{
      if(demo){
        const object=options.objects.find(x=>x.id===importObject);
        const fallbackSpecialty=options.specialties.find(x=>x.id===importSpecialty);
        const created=importRows.map(row=>({id:crypto.randomUUID(),organizationId:"demo",fullName:row.fullName,status:"active",source:"Импорт сотрудников",object:object?.name??null,objectId:object?.id??null,ownerUserId:object?.ownerUserId??undefined,assigneeUserIds:object?.assigneeUserIds??[],managerName:object?.ownerName??null,specialty:row.specialtyName??fallbackSpecialty?.name??null,specialtyId:fallbackSpecialty?.id??null,startDate:row.startDate??importStart,employment:row.relationType??"employment",workMode:row.workMode??importWorkMode,paidHoursPerShift:row.paidHoursPerShift??(importPaidHours?Number(importPaidHours):null),rate:row.rate,rateUnit:row.rateUnit??"hour",accrued:0,paid:0,payable:0} as WorkerRow));
        setLocalRows(current=>[...created,...current]);
        setImportResult(`Добавлено сотрудников: ${created.length}`);
      }else{
        const response=await fetch("/api/workers/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rows:importRows,objectId:importObject,specialtyId:importSpecialty||null,startDate:importStart,relationType:"employment",workMode:importWorkMode,paidHoursPerShift:importPaidHours?Number(importPaidHours):null})});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось импортировать сотрудников");
        setImportResult(`Новых: ${json.created}, найдено существующих: ${json.reused}, назначено: ${json.assigned}, замечаний: ${json.issues?.length??0}`);
        window.setTimeout(()=>window.location.reload(),700);
      }
    }catch(e){setError(e instanceof Error?e.message:"Не удалось импортировать сотрудников");}
    finally{setBusy(false);}
  }

  return <div className="workers-portfolio-workspace">
    <div className="metrics-grid personnel-portfolio-metrics">
      <div className="metric"><span>Работают</span><strong>{totals.working}</strong><small>активный персонал на объектах</small></div>
      <div className={"metric "+(totals.absent?"tone-warn":"tone-good")}><span>Отсутствуют</span><strong>{totals.absent}</strong><small>больничный, отпуск, межвахта</small></div>
      <div className={"metric "+(totals.changes?"tone-warn":"")}><span>Плановые изменения</span><strong>{totals.changes}</strong><small>уходы и переводы</small></div>
      <div className={"metric "+(totals.attention?"tone-bad":"tone-good")}><span>Требуют внимания</span><strong>{totals.attention}</strong><small>документы, СИЗ, невыходы и изменения</small></div>
    </div>

    <div className="object-local-tabs personnel-portfolio-tabs" role="tablist" aria-label="Представление сотрудников">
      <button type="button" className={view==="operational"?"active":""} onClick={()=>setView("operational")}>Все сотрудники <span>{localRows.length}</span></button>
      <button type="button" className={view==="attention"?"active":""} onClick={()=>setView("attention")}>Требуют внимания <span>{totals.attention}</span></button>
      {sensitive&&<button type="button" className={view==="compensation"?"active":""} onClick={()=>setView("compensation")}>Расчётный вид</button>}
    </div>

    <div className="workers-toolbar personnel-portfolio-toolbar">
      <div className="workers-filterbar personnel-portfolio-filters">
        <SalesSearch value={query} onChange={setQuery} placeholder="ФИО, объект, менеджер или специальность"/>
        <select aria-label="Фильтр по менеджеру" value={managerFilter} onChange={e=>setManagerFilter(e.target.value)}><option value="">Все менеджеры</option>{managerOptions.map(value=><option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Фильтр по объекту" value={objectFilter} onChange={e=>setObjectFilter(e.target.value)}><option value="">Все объекты</option>{objectOptions.map(value=><option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Фильтр по специальности" value={specialtyFilter} onChange={e=>setSpecialtyFilter(e.target.value)}><option value="">Все специальности</option>{specialtyOptions.map(value=><option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Фильтр по формату работы" value={workModeFilter} onChange={e=>setWorkModeFilter(e.target.value)}><option value="">Все форматы</option><option value="local">Местный</option><option value="rotation">Вахта</option></select>
        <select aria-label="Фильтр по состоянию" value={stateFilter} onChange={e=>setStateFilter(e.target.value)}><option value="">Все состояния</option>{stateOptions.map(value=><option key={value} value={value}>{value}</option>)}</select>
        {hasFilters&&<button className="button" type="button" onClick={()=>{setQuery("");setObjectFilter("");setManagerFilter("");setSpecialtyFilter("");setWorkModeFilter("");setStateFilter("")}}>Сбросить</button>}
      </div>
      {canEdit&&<div className="candidate-directory-buttons"><button className="button" onClick={()=>setShowImport(true)}><Upload size={14}/> Импорт Excel</button><button className="button primary" onClick={()=>setShowCreate(true)}><Plus size={14}/> Добавить сотрудника</button></div>}
    </div>

    <div className="workers-resultbar"><span>Показано {filtered.length} из {localRows.length}</span><span>Объектов: {new Set(filtered.map(row=>row.objectId).filter(Boolean)).size}</span></div>
    <div className="personnel-portfolio-groups">
      {groups.map(group=><section className="section personnel-manager-group" key={group.name}>
        <div className="personnel-manager-head"><div><strong>{group.name}</strong><span>{group.rows.length} сотрудников · {new Set(group.rows.map(row=>row.objectId).filter(Boolean)).size} объектов</span></div><div>{group.rows.some(workerNeedsAttention)?<Status tone="warn">Требуют внимания: {group.rows.filter(workerNeedsAttention).length}</Status>:<Status tone="good">Без отклонений</Status>}</div></div>
        <div className="request-table-wrap"><table className="data-table workers-table personnel-workers-table">
          {view==="compensation"?<>
            <thead><tr><th>Сотрудник</th><th>Объект</th><th>Специальность</th><th>Оформление</th><th>Ставка</th><th>Начислено</th><th>Выплачено</th><th>К выплате</th><th>Статус</th></tr></thead>
            <tbody>{group.rows.map(row=><tr key={row.id}><td><Link className="cell-title" href={`/workers/${row.id}`}>{row.fullName}</Link></td><td>{row.object&&row.objectId?<Link href={"/objects/"+row.objectId+"?tab=workforce"}>{row.object}</Link>:"Без назначения"}</td><td>{row.specialty??"—"}</td><td>{employmentTypeLabel(row.employment)}</td><td className="num">{rateLabel(row)}</td><td className="num">{row.accrued==null?"—":rub(row.accrued)}</td><td className="num">{row.paid==null?"—":rub(row.paid)}</td><td className="num">{row.payable==null?"—":rub(row.payable)}</td><td><Status tone={row.status==="active"?"good":"neutral"}>{workerStatusLabel(row.status)}</Status></td></tr>)}</tbody>
          </>:<>
            <thead><tr><th>Сотрудник</th><th>Объект</th><th>Специальность</th><th>График</th><th>Сегодня</th><th>Ближайшее изменение</th><th>Документы</th><th>Обеспечение</th><th>Статус</th></tr></thead>
            <tbody>{group.rows.map(row=><tr key={row.id} className={workerNeedsAttention(row)?"row-attention":""}>
              <td><Link className="cell-title" href={`/workers/${row.id}`}>{row.fullName}</Link><span className="cell-sub">{row.workMode==="rotation"?"Вахта":"Местный"}</span></td>
              <td>{row.object&&row.objectId?<Link href={"/objects/"+row.objectId+"?tab=workforce"}>{row.object}</Link>:"Без назначения"}</td>
              <td>{row.specialty??"—"}</td>
              <td>{scheduleLabel(row)}</td>
              <td><Status tone={todayStateTone(row)}>{todayState(row)}</Status>{row.todayShiftTime&&<span className="cell-sub">{row.todayShiftTime}</span>}</td>
              <td>{nextChange(row)}</td>
              <td><Status tone={row.employmentDocumentsStatus==="completed"?"good":row.employmentDocumentsStatus?"warn":"neutral"}>{documentsLabel(row.employmentDocumentsStatus)}</Status></td>
              <td>{Number(row.ppeRequiredCount??0)>0?<><Status tone={Number(row.ppeIssuedCount??0)>=Number(row.ppeRequiredCount??0)?"good":"warn"}>{row.ppeIssuedCount??0}/{row.ppeRequiredCount??0}</Status>{row.ppeMissingNames?.length?<span className="cell-sub">{row.ppeMissingNames.join(", ")}</span>:null}</>:<span className="cell-sub">Не задано</span>}</td>
              <td><Status tone={workerNeedsAttention(row)?"warn":row.status==="active"?"good":"neutral"}>{workerNeedsAttention(row)?"Проверить":workerStatusLabel(row.status)}</Status></td>
            </tr>)}</tbody>
          </>}
        </table></div>
      </section>)}
      {!groups.length&&<div className="empty-inline">Сотрудники по выбранным фильтрам не найдены.</div>}
    </div>
    {showCreate&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowCreate(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Новый сотрудник</h2><p>Для действующих сотрудников компании карточку можно создать без кандидата.</p></div><button className="icon-button" onClick={()=>setShowCreate(false)}><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options">
        <label>ФИО<input value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></label>
        <label>Телефон<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label>Email<input value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <label>Город<input value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label>
        <label>Дата рождения<input type="date" value={form.birthDate} onChange={e=>setForm({...form,birthDate:e.target.value})}/></label>
        <label>Объект<select value={form.objectId} onChange={e=>setForm({...form,objectId:e.target.value})}><option value="">Без назначения</option>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Специальность<select value={form.specialtyId} onChange={e=>setForm({...form,specialtyId:e.target.value})}><option value="">Выберите</option>{options.specialties.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Дата начала<input type="date" value={form.startDate} onChange={e=>setForm({...form,startDate:e.target.value})}/></label>
        <label>Формат работы<select value={form.workMode} onChange={e=>setForm({...form,workMode:e.target.value as FormState["workMode"]})}><option value="local">Местный</option><option value="rotation">Вахта</option></select></label>
        <label>Оформление<select value={form.relationType} onChange={e=>setForm({...form,relationType:e.target.value as FormState["relationType"]})}><option value="employment">Трудовой договор</option><option value="gph">ГПХ</option><option value="npd">Самозанятый</option><option value="custom">Другое</option></select></label>
        <label>Ставка<input type="number" min="0" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></label>
        <label>Единица<select value={form.rateUnit} onChange={e=>setForm({...form,rateUnit:e.target.value as FormState["rateUnit"]})}><option value="hour">₽/час</option><option value="shift">₽/смену</option><option value="month">₽/месяц</option></select></label>
        {form.rateUnit==="shift"&&<label>Оплачиваемых часов в смене<input type="number" min="0.5" max="24" step="0.5" value={form.paidHoursPerShift} onChange={e=>setForm({...form,paidHoursPerShift:e.target.value})} placeholder="Например, 11"/></label>}
        <label>Размер одежды<input value={form.clothingSize} onChange={e=>setForm({...form,clothingSize:e.target.value})}/></label>
        <label>Размер обуви<input value={form.shoeSize} onChange={e=>setForm({...form,shoeSize:e.target.value})}/></label>
      </div>{error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowCreate(false)}>Отмена</button><button className="button primary" disabled={busy} onClick={()=>void createWorker()}>{busy?"Сохраняю…":"Создать сотрудника"}</button></div>
    </div></div></Portal>}

    {showImport&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShowImport(false)}}><div className="recruiting-modal-card candidate-import-modal">
      <div className="recruiting-modal-head"><div><h2>Импорт сотрудников</h2><p>Массовая загрузка действующего персонала на выбранный объект.</p></div><button className="icon-button" onClick={()=>setShowImport(false)}><X size={17}/></button></div>
      <div className="candidate-import-body">
        <section className="candidate-import-template"><div><FileSpreadsheet size={20}/><span><strong>Шаблон OPERIS</strong><small>ФИО, контакты, специальность, дата начала и ставка.</small></span></div><button className="button" onClick={()=>void downloadTemplate()}><Download size={14}/> Скачать .xlsx</button></section>
        <label className="candidate-import-drop"><Upload size={18}/><strong>Выберите Excel-файл</strong><span>.xlsx или .xls · до 1000 строк</span><input type="file" accept=".xlsx,.xls" onChange={e=>{const file=e.target.files?.[0];if(file)void readImportFile(file)}}/></label>
        <div className="candidate-import-options">
          <label>Объект<select value={importObject} onChange={e=>setImportObject(e.target.value)}><option value="">Выберите объект</option>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Специальность по умолчанию<select value={importSpecialty} onChange={e=>setImportSpecialty(e.target.value)}><option value="">Из файла</option>{options.specialties.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Дата начала по умолчанию<input type="date" value={importStart} onChange={e=>setImportStart(e.target.value)}/></label><label>Формат по умолчанию<select value={importWorkMode} onChange={e=>setImportWorkMode(e.target.value as "local"|"rotation")}><option value="local">Местный</option><option value="rotation">Вахта</option></select></label><label>Оплачиваемых часов в смене<input type="number" min="0.5" max="24" step="0.5" value={importPaidHours} onChange={e=>setImportPaidHours(e.target.value)} placeholder="Если ставка за смену"/></label>
        </div>
        {importRows.length>0&&<div className="candidate-import-preview"><header><strong>Найдено строк: {importRows.length}</strong><span>Первые 6 строк</span></header><div className="request-table-wrap"><table className="data-table"><thead><tr><th>ФИО</th><th>Телефон</th><th>Специальность</th><th>Старт</th></tr></thead><tbody>{importRows.slice(0,6).map((row,index)=><tr key={index}><td>{row.fullName}</td><td>{row.phone??"—"}</td><td>{row.specialtyName??"по умолчанию"}</td><td>{row.startDate??importStart}</td></tr>)}</tbody></table></div></div>}
        {error&&<div className="recruiting-error">{error}</div>}{importResult&&<div className="candidate-import-result">{importResult}</div>}
      </div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShowImport(false)}>Закрыть</button><button className="button primary" disabled={busy||!importRows.length||!importObject} onClick={()=>void runImport()}>{busy?"Импортирую…":`Импортировать ${importRows.length||""}`}</button></div>
    </div></div></Portal>}
  </div>;
}

function mapImportRow(row:Record<string,unknown>):ImportRow|null{
  const get=(...keys:string[])=>{for(const key of keys){const value=row[key];if(value!=null&&String(value).trim())return String(value).trim()}return""};
  const fullName=get("ФИО","Фамилия Имя Отчество","fullName");if(!fullName)return null;
  const relationRaw=get("Оформление","relationType").toLowerCase();
  const relationType=(["employment","gph","npd","custom"].includes(relationRaw)?relationRaw:null) as ImportRow["relationType"];
  const unitRaw=get("Единица ставки","rateUnit").toLowerCase();
  const rateUnit=(["hour","shift","month"].includes(unitRaw)?unitRaw:null) as ImportRow["rateUnit"];
  const rateRaw=get("Ставка","rate");
  const modeRaw=get("Формат работы","workMode").toLocaleLowerCase("ru");
  const workMode=modeRaw==="rotation"||modeRaw==="вахта"?"rotation":modeRaw==="local"||modeRaw==="местный"?"local":null;
  const paidHoursRaw=get("Оплачиваемых часов в смене","paidHoursPerShift");
  return {fullName,phone:nullable(get("Телефон","phone")),email:nullable(get("Email","E-mail","email")),city:nullable(get("Город","city")),birthDate:nullable(get("Дата рождения","birthDate")),specialtyName:nullable(get("Специальность","specialty")),startDate:nullable(get("Дата начала","startDate")),relationType,rate:rateRaw?Number(rateRaw.replace(",",".")):null,rateUnit,workMode,paidHoursPerShift:paidHoursRaw?Number(paidHoursRaw.replace(",",".")):null};
}
const absenceLabels:Record<string,string>={intershift:"Межвахта",vacation:"Отпуск",sick:"Больничный",personal:"Личное отсутствие",other:"Отсутствие"};
const timeCodeLabels:Record<string,string>={WORK:"На смене",NO_SHOW:"Невыход",DAY_OFF:"Выходной",INTERSHIFT:"Межвахта",VACATION:"Отпуск",SICK:"Больничный"};
function todayState(row:WorkerRow){
  const current=operationalState(row);
  if(current!=="Работает")return current;
  if(row.todayTimeCode&&timeCodeLabels[row.todayTimeCode])return timeCodeLabels[row.todayTimeCode];
  if(row.todayShiftAssigned)return row.todayShiftConfirmed?"Смена подтверждена":"Смена назначена";
  return "Нет смены";
}
function todayStateTone(row:WorkerRow){
  const state=todayState(row);
  if(state==="Невыход")return "bad" as const;
  if(["Больничный","Отпуск","Межвахта","Смена назначена"].includes(state))return "warn" as const;
  if(["На смене","Смена подтверждена"].includes(state))return "good" as const;
  return "neutral" as const;
}
function scheduleLabel(row:WorkerRow){
  const cycle=row.scheduleWorkDays!=null?row.scheduleWorkDays+"/"+(row.scheduleRestDays??0):"—";
  const shift=row.scheduleShiftKind==="day"?"день":row.scheduleShiftKind==="night"?"ночь":row.scheduleShiftKind==="mixed"?"день/ночь":"";
  return shift?cycle+" · "+shift:cycle;
}
function nextChange(row:WorkerRow){
  const changes:Array<{date:string;text:string}>=[];
  if(row.plannedExitDate)changes.push({date:row.plannedExitDate,text:"уход "+formatDate(row.plannedExitDate)});
  if(row.plannedTransferDate)changes.push({date:row.plannedTransferDate,text:"перевод "+formatDate(row.plannedTransferDate)+(row.plannedTransferObject?" · "+row.plannedTransferObject:"")});
  if(row.absenceStatus==="confirmed"&&row.absenceFrom&&row.absenceFrom<=today()){
    changes.push({date:row.absenceTo??"9999-12-31",text:row.absenceTo?"возврат "+formatDate(addDays(row.absenceTo,1)):"дата возврата не задана"});
  }else if(row.absenceFrom&&row.absenceFrom>today())changes.push({date:row.absenceFrom,text:(absenceLabels[row.absenceType??""]??"Отсутствие").toLocaleLowerCase("ru")+" с "+formatDate(row.absenceFrom)});
  return changes.sort((a,b)=>a.date.localeCompare(b.date))[0]?.text??"—";
}
function documentsLabel(value:string|null|undefined){return ({completed:"Готовы",submitted:"Переданы",processing:"Проверка",collecting:"Сбор"} as Record<string,string>)[value??""]??"Не указано"}
function workerNeedsAttention(row:WorkerRow){
  if(row.status!=="active")return false;
  if(!row.objectId||!row.specialtyId)return true;
  if(row.todayTimeCode==="NO_SHOW"||row.todayAttendanceEvent==="no_show")return true;
  if(row.employmentDocumentsStatus&&row.employmentDocumentsStatus!=="completed")return true;
  if(Number(row.ppeRequiredCount??0)>Number(row.ppeIssuedCount??0))return true;
  if(row.absenceStatus==="confirmed"&&row.absenceFrom&&row.absenceFrom<=today()&&!row.absenceTo)return true;
  if(row.plannedExitDate||row.plannedTransferDate)return true;
  if(row.todayShiftAssigned&&!row.todayShiftConfirmed)return true;
  return false;
}
function operationalState(row:WorkerRow){if(row.status==="dismissed")return"Работа завершена";const current=Boolean(row.absenceStatus==="confirmed"&&row.absenceFrom&&row.absenceFrom<=today()&&(!row.absenceTo||row.absenceTo>=today()));return current?(absenceLabels[row.absenceType??""]??"Отсутствует"):"Работает"}
function availabilityChange(row:WorkerRow){if(!row.absenceFrom)return"—";const label=absenceLabels[row.absenceType??""]??"Отсутствие";if(row.absenceStatus==="confirmed"&&row.absenceFrom<=today()&&(!row.absenceTo||row.absenceTo>=today()))return row.absenceTo?`возврат ${formatDate(addDays(row.absenceTo,1))}`:"дата возврата открыта";return `${label.toLocaleLowerCase("ru")} с ${formatDate(row.absenceFrom)}`}
function addDays(value:string,days:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function formatDate(value:string){return new Intl.DateTimeFormat("ru-RU").format(new Date(value+"T00:00:00"))}
function rateLabel(row:WorkerRow){if(row.rate==null)return"—";const unit=row.rateUnit==="shift"?"/смену":row.rateUnit==="month"?"/мес":"/ч";if(row.rateUnit==="shift"&&Number(row.paidHoursPerShift)>0)return`${rub(row.rate)}${unit} · ${rub(Number(row.rate)/Number(row.paidHoursPerShift))}/ч`;return`${rub(row.rate)}${unit}`}
function nullable(value:string){return value||null}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
