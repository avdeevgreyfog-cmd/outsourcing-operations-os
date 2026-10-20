"use client";
import {RegistryDrawer} from "@/components/registry/RegistryDrawer";
import {useState} from "react";
import * as XLSX from "xlsx";
import type {QuickStartImportPayload,ImportIssue} from "@/lib/operations/quick-start-import";

type Preview={digest:string;canCommit:boolean;issues:ImportIssue[];objectRows:Array<{id:string;reuse:boolean}>;workerRows:Array<{id:string;reuse:boolean}>;assignments:Array<{id:string;reuse:boolean}>;hours:unknown[]};
const sections=["Объекты","Сотрудники","Назначения","Часы"] as const;
const columns={
 Объекты:["Ключ","Название","ID","Адрес","Дата запуска"],
 Сотрудники:["Ключ","ФИО","ID","Телефон","Статус"],
 Назначения:["Сотрудник","Объект","Специальность","Дата начала","Дата окончания"],
 Часы:["Сотрудник","Объект","Дата","Часы","Вид смены"],
};
const text=(v:unknown)=>v==null?"":String(v).trim();
const nullable=(v:unknown)=>text(v)||null;
function date(v:unknown){if(typeof v==="number"){const d=XLSX.SSF.parse_date_code(v);return d?`${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`:text(v);}const s=text(v);const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);return m?`${m[3]}-${m[2]}-${m[1]}`:s;}
export default function QuickStartImportWizard({demo,onClose,onDone}:{demo:boolean;onClose:()=>void;onDone:()=>void}){
 const [payload,setPayload]=useState<QuickStartImportPayload|null>(null),[preview,setPreview]=useState<Preview|null>(null),[step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState("");
 const [raw,setRaw]=useState<Record<string,Record<string,unknown>[]>>({});
 function template(){const book=XLSX.utils.book_new();for(const section of sections)XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([columns[section]]),section);XLSX.writeFile(book,"OPERIS_Быстрый_старт.xlsx");}
 async function load(file:File){setError("");setPreview(null);setDone("");setPayload(null);try{
  const book=XLSX.read(await file.arrayBuffer(),{type:"array"});const rows:Record<string,Record<string,unknown>[]>={};for(const s of sections)rows[s]=book.Sheets[s]?XLSX.utils.sheet_to_json(book.Sheets[s],{defval:null}):[];
  const id=(v:unknown)=>text(v)||undefined;
  const next={objects:rows.Объекты.map(r=>({key:text(r.Ключ),name:text(r.Название),id:id(r.ID),address:nullable(r.Адрес),actualStartDate:date(r["Дата запуска"])||null})),workers:rows.Сотрудники.map(r=>({key:text(r.Ключ),fullName:text(r.ФИО),id:id(r.ID),phone:nullable(r.Телефон),status:(text(r.Статус)==="требует назначения"?"requires_assignment":text(r.Статус)==="действующий"?"active":text(r.Статус)||undefined)})),assignments:rows.Назначения.map(r=>({worker:text(r.Сотрудник),object:text(r.Объект),specialtyId:text(r["ID специальности"])||undefined,specialtyName:nullable(r.Специальность),startDate:date(r["Дата начала"])||null,endDate:date(r["Дата окончания"])||null})),hours:rows.Часы.map(r=>({worker:text(r.Сотрудник),object:text(r.Объект),date:date(r.Дата),hours:text(r.Часы)===""?null:Number(text(r.Часы).replace(",",".")),kind:text(r["Вид смены"])==="день"?"day":text(r["Вид смены"])==="ночь"?"night":text(r["Вид смены"])}))};
  setRaw(rows);setPayload(next as QuickStartImportPayload);setStep(0);
 }catch{setError("Не удалось прочитать файл. Используйте XLSX-шаблон с четырьмя листами.");}}
 async function send(action:"preview"|"commit"){
  if(!payload)return;setBusy(true);setError("");try{
   const response=await fetch("/api/operations/quick-start/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,payload,digest:preview?.digest})});
   const result=await response.json();if(!response.ok){const details=Array.isArray(result.issues)?result.issues.map((i:{path?:unknown[];message:string})=>`${i.path?.join(" → ")??""}: ${i.message}`).join("; "):"";throw new Error([result.error,details].filter(Boolean).join(". "));}
   if(action==="preview")setPreview(result);else{setDone(`Создано объектов: ${result.objects}, сотрудников: ${result.workers}, назначений: ${result.assignments}, записей часов: ${result.hours}.`);setPreview(null);}
  }catch(e){setError(e instanceof Error?e.message:"Не удалось выполнить импорт");if(action==="commit")setPreview(null);}finally{setBusy(false);}
 }
 const section=sections[step],rows=raw[section]??[];
 return <RegistryDrawer title="Быстрый старт действующего контура" className="quick-start-import-drawer" onClose={()=>{if(!busy)onClose()}} footer={done?<button type="button" className="button primary" onClick={onDone}>Готово</button>:<><button type="button" className="button" disabled={!payload||busy||demo} onClick={()=>void send("preview")}>{busy?"Проверка…":"Проверить все строки"}</button><button type="button" className="button primary" disabled={!preview?.canCommit||busy||demo} onClick={()=>void send("commit")}>Импортировать проверенные данные</button></>}>
   <p>Объекты → сотрудники → назначения → исторические часы. Неизвестные данные оставляйте пустыми. Объекту достаточно названия, сотруднику — ФИО. Ключи связывают строки между листами; вместо ключа существующей записи можно указать её ID.</p>
   <p>Назначению нужна специальность; пустая дата начала сохраняется как «неизвестна, требует уточнения». Часы необязательны; для каждой записи нужны дата, число от 0 до 24 и вид смены. Существующие профили и факты не перезаписываются.</p>
   {demo&&<p role="status">В демонстрации можно изучить шаблон. Сохранение импорта доступно только в рабочей организации.</p>}
   <div className="quick-start-import-actions"><button type="button" className="button" onClick={template}>Скачать XLSX-шаблон</button><label className="button">Открыть XLSX<input type="file" accept=".xlsx,.xls" disabled={busy||!!done} onChange={e=>{const file=e.target.files?.[0];if(file)void load(file);}} /></label></div>
   <nav aria-label="Этапы импорта" className="quick-start-import-steps">{sections.map((s,i)=><button type="button" key={s} aria-current={step===i?"step":undefined} onClick={()=>setStep(i)}>{i+1}. {s} ({raw[s]?.length??0})</button>)}</nav>
   {payload&&<><h3>{section}: все строки</h3><div style={{overflow:"auto",maxHeight:320}}><table className="data-table"><thead><tr><th>Строка</th>{columns[section].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{i+2}</td>{columns[section].map(c=><td key={c}>{text(r[c])||"Не указано"}</td>)}</tr>)}</tbody></table>{!rows.length&&<p>Нет строк. Этот этап можно пропустить.</p>}</div></>}
   {error&&<p role="alert">{error}</p>}
   {preview&&<section aria-label="Результат предварительной проверки"><h3>Проверка всех листов</h3><p>Объекты: {preview.objectRows.length}; сотрудники: {preview.workerRows.length}; назначения: {preview.assignments.length}; часы: {preview.hours.length}.</p><ul>{preview.issues.map((i,n)=><li key={n}>{i.blocking?"Ошибка":"Предупреждение"}: {i.section}, строка {i.row} — {i.message}</li>)}</ul>{!preview.issues.length&&<p>Блокирующих замечаний нет.</p>}</section>}
   {done&&<p role="status">{done}</p>}
 </RegistryDrawer>;
}
