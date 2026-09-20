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

type ImportRow={fullName:string;phone:string|null;email:string|null;city:string|null;birthDate:string|null;specialtyName:string|null;startDate:string|null;relationType:"employment"|"gph"|"npd"|"custom"|null;rate:number|null;rateUnit:"hour"|"shift"|"month"|null};
type FormState={fullName:string;phone:string;email:string;city:string;birthDate:string;objectId:string;specialtyId:string;startDate:string;relationType:"employment"|"gph"|"npd"|"custom";rate:string;rateUnit:"hour"|"shift"|"month";clothingSize:string;shoeSize:string;heightCm:string;notes:string};
const today=()=>new Date().toISOString().slice(0,10);
const blank=():FormState=>({fullName:"",phone:"",email:"",city:"",birthDate:"",objectId:"",specialtyId:"",startDate:today(),relationType:"employment",rate:"",rateUnit:"hour",clothingSize:"",shoeSize:"",heightCm:"",notes:""});

export function WorkersWorkspace({rows,options,sensitive,canEdit,demo}:{rows:WorkerRow[];options:OperationsReferenceData;sensitive:boolean;canEdit:boolean;demo:boolean}){
  const [query,setQuery]=useState("");
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
  const [importResult,setImportResult]=useState("");

  const filtered=useMemo(()=>localRows.filter(row=>`${row.fullName} ${row.object??""} ${row.source??""}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru"))),[localRows,query]);

  async function createWorker(){
    setBusy(true);setError("");
    try{
      if(!form.fullName.trim())throw new Error("Укажите ФИО");
      if((form.objectId&&!form.specialtyId)||(!form.objectId&&form.specialtyId))throw new Error("Объект и специальность указываются вместе");
      if(demo){
        const object=options.objects.find(x=>x.id===form.objectId);
        setLocalRows(current=>[{id:crypto.randomUUID(),organizationId:"demo",fullName:form.fullName,status:"active",source:"Ручное создание",object:object?.name??null,objectId:object?.id??null,rate:form.rate?Number(form.rate):null,accrued:0,paid:0,payable:0},...current]);
      }else{
        const response=await fetch("/api/workers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
          ...form,phone:form.phone||null,email:form.email||null,city:form.city||null,birthDate:form.birthDate||null,
          objectId:form.objectId||null,specialtyId:form.specialtyId||null,rate:form.rate?Number(form.rate):null,
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
    const sheet=XLSX.utils.json_to_sheet([{"ФИО":"Иванов Иван Иванович","Телефон":"+7 900 000-00-00","Email":"","Город":"Тула","Дата рождения":"","Специальность":"Комплектовщик","Дата начала":today(),"Оформление":"employment","Ставка":3900,"Единица ставки":"shift"}]);
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
        const created=importRows.map(row=>({id:crypto.randomUUID(),organizationId:"demo",fullName:row.fullName,status:"active",source:"Импорт сотрудников",object:object?.name??null,objectId:object?.id??null,rate:row.rate,accrued:0,paid:0,payable:0} as WorkerRow));
        setLocalRows(current=>[...created,...current]);
        setImportResult(`Добавлено сотрудников: ${created.length}`);
      }else{
        const response=await fetch("/api/workers/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rows:importRows,objectId:importObject,specialtyId:importSpecialty||null,startDate:importStart,relationType:"employment"})});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось импортировать сотрудников");
        setImportResult(`Новых: ${json.created}, найдено существующих: ${json.reused}, назначено: ${json.assigned}, замечаний: ${json.issues?.length??0}`);
        window.setTimeout(()=>window.location.reload(),700);
      }
    }catch(e){setError(e instanceof Error?e.message:"Не удалось импортировать сотрудников");}
    finally{setBusy(false);}
  }

  return <div>
    <div className="candidate-directory-viewbar">
      <SalesSearch value={query} onChange={setQuery} placeholder="Сотрудник, объект или источник"/>
      {canEdit&&<div className="candidate-directory-buttons"><button className="button" onClick={()=>setShowImport(true)}><Upload size={14}/> Импорт Excel</button><button className="button primary" onClick={()=>setShowCreate(true)}><Plus size={14}/> Добавить сотрудника</button></div>}
    </div>
    <section className="section section-flush"><div className="request-table-wrap"><table className="data-table">
      <thead><tr><th>Сотрудник</th><th>Объект</th><th>Источник</th><th>Оформление</th>{sensitive&&<><th>Ставка</th><th>Начислено</th><th>К выплате</th></>}<th>Статус</th></tr></thead>
      <tbody>{filtered.map(row=><tr key={row.id}>
        <td><Link className="cell-title" href={`/workers/${row.id}`}>{row.fullName}</Link></td>
        <td>{row.object??"Без назначения"}</td>
        <td>{row.origin??row.source??"—"}</td>
        <td>{row.employment??"—"}</td>
        {sensitive&&<><td className="num">{row.rate==null?"—":rub(row.rate)}</td><td className="num">{row.accrued==null?"—":rub(row.accrued)}</td><td className="num">{row.payable==null?"—":rub(row.payable)}</td></>}
        <td><Status tone={row.status==="active"?"good":"neutral"}>{row.status==="active"?"Работает":row.status}</Status></td>
      </tr>)}</tbody>
    </table>{!filtered.length&&<div className="empty-inline">Сотрудники не найдены</div>}</div></section>

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
        <label>Оформление<select value={form.relationType} onChange={e=>setForm({...form,relationType:e.target.value as FormState["relationType"]})}><option value="employment">Трудовой договор</option><option value="gph">ГПХ</option><option value="npd">Самозанятый</option><option value="custom">Другое</option></select></label>
        <label>Ставка<input type="number" min="0" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></label>
        <label>Единица<select value={form.rateUnit} onChange={e=>setForm({...form,rateUnit:e.target.value as FormState["rateUnit"]})}><option value="hour">₽/час</option><option value="shift">₽/смену</option><option value="month">₽/месяц</option></select></label>
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
          <label>Дата начала по умолчанию<input type="date" value={importStart} onChange={e=>setImportStart(e.target.value)}/></label>
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
  return {fullName,phone:nullable(get("Телефон","phone")),email:nullable(get("Email","E-mail","email")),city:nullable(get("Город","city")),birthDate:nullable(get("Дата рождения","birthDate")),specialtyName:nullable(get("Специальность","specialty")),startDate:nullable(get("Дата начала","startDate")),relationType,rate:rateRaw?Number(rateRaw.replace(",",".")):null,rateUnit};
}
function nullable(value:string){return value||null}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
