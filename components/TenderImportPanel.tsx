"use client";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import * as XLSX from "xlsx";
import {Download,FileSpreadsheet,Upload,X} from "lucide-react";

type Row=Record<string,string>;
type Field="title"|"customerName"|"platform"|"procedureNumber"|"sourceUrl"|"publicationDate"|"submissionDeadline"|"initialPrice"|"comment";
const fields:Array<{key:Field;label:string;required?:boolean;aliases:string[]}>= [
  {key:"title",label:"Название тендера",required:true,aliases:["название","наименование","предмет","тендер","закупка","название закупки"]},
  {key:"customerName",label:"Заказчик",aliases:["заказчик","организация","компания","наименование заказчика"]},
  {key:"platform",label:"Площадка",aliases:["площадка","этп","эtp","источник","система"]},
  {key:"procedureNumber",label:"№ процедуры",aliases:["номер","номер процедуры","номер закупки","реестровый номер","id"]},
  {key:"sourceUrl",label:"Ссылка",aliases:["ссылка","url","ссылка на закупку","адрес"]},
  {key:"publicationDate",label:"Дата публикации",aliases:["дата публикации","опубликовано"]},
  {key:"submissionDeadline",label:"Подача до",aliases:["окончание подачи","срок подачи","подача до","дата окончания","окончание","дедлайн"]},
  {key:"initialPrice",label:"НМЦК / начальная цена",aliases:["нмцк","начальная цена","цена","сумма","начальная максимальная цена"]},
  {key:"comment",label:"Комментарий",aliases:["комментарий","примечание","заметка"]},
];
function norm(value:string){return value.toLowerCase().replace(/[№#]/g,"номер").replace(/\s+/g," ").trim();}
function autoMap(headers:string[]){const result:Partial<Record<Field,string>>={};for(const field of fields){const exact=headers.find(h=>field.aliases.includes(norm(h)));if(exact)result[field.key]=exact;else{const loose=headers.find(h=>field.aliases.some(a=>norm(h).includes(a)||a.includes(norm(h))));if(loose)result[field.key]=loose;}}return result;}
function text(value:unknown){return value==null?"":String(value).trim();}
function parseDate(value:string){if(!value)return null;const ru=value.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);if(ru){const [,d,m,y,hh="00",mm="00"]=ru;const date=new Date(Number(y),Number(m)-1,Number(d),Number(hh),Number(mm));return Number.isNaN(date.getTime())?null:date.toISOString();}const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString();}
function parseDay(value:string){const iso=parseDate(value);return iso?iso.slice(0,10):null;}
function parseMoney(value:string){if(!value)return null;const n=Number(value.replace(/\s/g,"").replace(/₽|руб\.?/gi,"").replace(",","."));return Number.isFinite(n)&&n>=0?n:null;}

export function TenderImportPanel({canImport}:{canImport:boolean}){
  const router=useRouter();const [open,setOpen]=useState(false);const [rows,setRows]=useState<Row[]>([]);const [headers,setHeaders]=useState<string[]>([]);const [mapping,setMapping]=useState<Partial<Record<Field,string>>>({});const [fileName,setFileName]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const mapped=useMemo(()=>rows.map(row=>({
    title:text(row[mapping.title??""]),customerName:text(row[mapping.customerName??""])||null,platform:text(row[mapping.platform??""])||null,procedureNumber:text(row[mapping.procedureNumber??""])||null,
    sourceUrl:text(row[mapping.sourceUrl??""])||null,publicationDate:parseDay(text(row[mapping.publicationDate??""])),submissionDeadline:parseDate(text(row[mapping.submissionDeadline??""])),initialPrice:parseMoney(text(row[mapping.initialPrice??""])),comment:text(row[mapping.comment??""])||null,sourceName:`Импорт · ${fileName||"таблица"}`,
  })).filter(row=>row.title),[rows,mapping,fileName]);
  const invalidDeadline=rows.filter(row=>mapping.submissionDeadline&&text(row[mapping.submissionDeadline])&&!parseDate(text(row[mapping.submissionDeadline]))).length;
  function downloadTemplate(){const data=[["Название тендера","Заказчик","Площадка","№ процедуры","Ссылка","Дата публикации","Подача до","НМЦК","Комментарий"],["Пример: Линейный персонал","ООО Заказчик","РТС-тендер","12345","https://example.com","09.09.2026","14.09.2026 10:00","8400000","Короткая заметка"]];const sheet=XLSX.utils.aoa_to_sheet(data);sheet["!cols"]=[{wch:34},{wch:28},{wch:18},{wch:18},{wch:38},{wch:18},{wch:22},{wch:18},{wch:34}];const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Тендеры");XLSX.writeFile(book,"OPERIS_шаблон_тендеров.xlsx");}
  async function readFile(file:File){setMessage("");setFileName(file.name);const buffer=await file.arrayBuffer();const book=XLSX.read(buffer,{type:"array",cellDates:true});const sheet=book.Sheets[book.SheetNames[0]];const matrix=XLSX.utils.sheet_to_json<Array<unknown>>(sheet,{header:1,defval:"",raw:false});if(!matrix.length){setMessage("В таблице нет данных");return;}const hs=(matrix[0]??[]).map(text).filter(Boolean);const data=matrix.slice(1).filter(r=>r.some(v=>text(v))).map(r=>Object.fromEntries(hs.map((h,i)=>[h,text(r[i])])));setHeaders(hs);setRows(data);setMapping(autoMap(hs));}
  async function submit(){if(!mapping.title){setMessage("Сопоставьте колонку «Название тендера»");return;}if(!mapped.length){setMessage("Нет строк, готовых к импорту");return;}setBusy(true);setMessage("");const response=await fetch("/api/tenders/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rows:mapped})});const json=await response.json().catch(()=>({}));setBusy(false);if(!response.ok){setMessage(json.error??"Не удалось импортировать тендеры");return;}setMessage(`Импортировано: ${json.imported?.length??0}. Пропущено как дубли: ${json.skipped?.length??0}.`);router.refresh();if((json.imported?.length??0)>0)setTimeout(()=>{setOpen(false);setRows([]);setHeaders([]);setMapping({});},900);}
  if(!canImport)return null;
  return <><button className="button" type="button" onClick={()=>setOpen(true)}><Upload size={14}/> Загрузить из таблицы</button>{open&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><aside className="drawer tender-import-drawer"><div className="drawer-head"><div><strong>Импорт тендеров</strong><span>Excel / XLSX. Сопоставьте колонки перед загрузкой.</span></div><button type="button" className="icon-button" onClick={()=>setOpen(false)}><X size={16}/></button></div><div className="drawer-body">
    <div className="tender-import-drop"><FileSpreadsheet size={28}/><strong>{fileName||"Выберите таблицу с тендерами"}</strong><span>Подойдёт ваш собственный Excel. Формат колонок не обязан совпадать с OPERIS.</span><label className="button"><Upload size={14}/> Выбрать XLSX<input hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const f=e.target.files?.[0];if(f)void readFile(f)}}/></label><button type="button" className="button ghost" onClick={downloadTemplate}><Download size={14}/> Скачать шаблон Excel</button></div>
    {headers.length>0&&<><div className="tender-import-section"><h4>Сопоставление колонок</h4><div className="tender-mapping-grid">{fields.map(field=><label key={field.key}><span>{field.label}{field.required?" *":""}</span><select value={mapping[field.key]??""} onChange={e=>setMapping(v=>({...v,[field.key]:e.target.value||undefined}))}><option value="">Не загружать</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div></div><div className="tender-import-section"><h4>Предпросмотр</h4><p className="muted">Строк: {rows.length} · готовы: {mapped.length}{invalidDeadline?` · не распознано сроков: ${invalidDeadline}`:""}</p><div className="grid-scroll"><table className="data-table"><thead><tr><th>Тендер</th><th>Заказчик</th><th>Площадка</th><th>Подача до</th></tr></thead><tbody>{mapped.slice(0,8).map((row,i)=><tr key={i}><td>{row.title}</td><td>{row.customerName??"—"}</td><td>{row.platform??"—"}</td><td>{row.submissionDeadline?new Date(row.submissionDeadline).toLocaleString("ru-RU"):"—"}</td></tr>)}</tbody></table></div></div></>}
    {message&&<p className={message.startsWith("Импортировано")?"form-success":"form-error"}>{message}</p>}
  </div><div className="drawer-footer"><button className="button" type="button" onClick={()=>setOpen(false)}>Отмена</button><button className="button primary" type="button" disabled={busy||mapped.length===0} onClick={submit}>{busy?"Импорт…":`Импортировать ${mapped.length||""}`}</button></div></aside></div>}</>;
}
