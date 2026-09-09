"use client";
import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import * as XLSX from "xlsx";
import {Download,FileSpreadsheet,Upload,X} from "lucide-react";

type Row=Record<string,string>;
type Field="title"|"customerName"|"platform"|"procedureNumber"|"sourceUrl"|"publicationDate"|"submissionDeadline"|"initialPrice"|"comment";
export type TenderImportRow={title:string;customerName:string|null;platform:string|null;procedureNumber:string|null;sourceUrl:string|null;publicationDate:string|null;submissionDeadline:string|null;initialPrice:number|null;comment:string|null;sourceName:string|null};
export type TenderImportResult={imported:number;skipped:number};
const fields:Array<{key:Field;label:string;required?:boolean;aliases:string[]}>= [
  {key:"title",label:"Название тендера",required:true,aliases:["название","название тендера","наименование","предмет","тендер","закупка","название закупки"]},
  {key:"customerName",label:"Заказчик",aliases:["заказчик","организация","компания","наименование заказчика"]},
  {key:"platform",label:"Площадка",aliases:["площадка","этп","эtp","система"]},
  {key:"procedureNumber",label:"Номер торга",aliases:["номер торга","номер процедуры","номер закупки","реестровый номер","номер","id"]},
  {key:"sourceUrl",label:"Ссылка",aliases:["ссылка","url","ссылка на закупку","адрес"]},
  {key:"publicationDate",label:"Дата публикации",aliases:["дата публикации","опубликовано"]},
  {key:"submissionDeadline",label:"Срок подачи",aliases:["срок","окончание подачи","срок подачи","подача до","дата окончания","окончание","дедлайн"]},
  {key:"initialPrice",label:"НМЦК / начальная цена",aliases:["цена в ₽","цена","нмцк","начальная цена","сумма","начальная максимальная цена"]},
  {key:"comment",label:"Комментарий",aliases:["короткий итог анализа","мой комент","мой комментарий","комментарий","примечание","заметка","ограничения"]},
];
function norm(value:string){return value.toLowerCase().replace(/[№#]/g,"номер").replace(/\s+/g," ").trim();}
function autoMap(headers:string[]){
  const result:Partial<Record<Field,string>>={};
  for(const field of fields){
    let match:string|undefined;
    for(const alias of field.aliases){match=headers.find(header=>norm(header)===alias);if(match)break;}
    if(!match){for(const alias of field.aliases){match=headers.find(header=>norm(header).includes(alias)||alias.includes(norm(header)));if(match)break;}}
    if(match)result[field.key]=match;
  }
  return result;
}
function text(value:unknown){return value==null?"":String(value).trim();}
function headerScore(row:Array<unknown>){const values=row.map(value=>norm(text(value))).filter(Boolean);return fields.reduce((sum,field)=>sum+(field.aliases.some(alias=>values.some(value=>value===alias||value.includes(alias)))?1:0),0);}
function parseDate(value:string){
  if(!value)return null;
  const ru=value.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if(ru){const [,d,m,y,hh="00",mm="00"]=ru;const date=new Date(Number(y),Number(m)-1,Number(d),Number(hh),Number(mm));return Number.isNaN(date.getTime())?null:date.toISOString();}
  const date=new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString();
}
function parseDay(value:string){const iso=parseDate(value);return iso?iso.slice(0,10):null;}
function parseMoney(value:string){if(!value)return null;const cleaned=value.replace(/[\s\u00a0]/g,"").replace(/₽|руб\.?/gi,"").replace(/[^\d,.-]/g,"").replace(",",".");const n=Number(cleaned);return Number.isFinite(n)&&n>=0?n:null;}
function inferPlatform(url:string,explicit:string){
  if(explicit)return explicit;
  const value=url.toLowerCase();
  if(value.includes("b2b-center"))return "B2B-Center";
  if(value.includes("bidzaar"))return "Bidzaar";
  if(value.includes("sberbank-ast"))return "Сбербанк-АСТ";
  if(value.includes("tektorg"))return "ТЭК-Торг";
  if(value.includes("zakupki.gov.ru"))return "ЕИС";
  if(value.includes("zakupki.mos.ru"))return "Портал поставщиков Москвы";
  if(value.includes("market.mosreg.ru"))return "Портал закупок Московской области";
  if(value.includes("zakupki.ru"))return "Zakupki.ru";
  if(value.includes("torgi223.ru"))return "Торги223";
  if(value.includes("tmk-group"))return "ТМК";
  return "";
}
function normalizeProcedure(value:string,url:string){
  if(!value)return "";
  if(/^\d+(?:\.\d+)?e[+-]?\d+$/i.test(value)){const numeric=Number(value);if(Number.isFinite(numeric))return numeric.toFixed(0);}
  if(/^\d+\.0$/.test(value))return value.slice(0,-2);
  if(!value&&url){const reg=url.match(/[?&](?:regNumber|id)=([^&#]+)/i);return reg?.[1]??"";}
  return value;
}
type SheetAnalysis={name:string;score:number;headerRow:number;headers:string[];rows:Row[]};
function analyzeSheet(book:XLSX.WorkBook,name:string):SheetAnalysis{
  const sheet=book.Sheets[name];
  const matrix=XLSX.utils.sheet_to_json<Array<unknown>>(sheet,{header:1,defval:"",raw:false});
  if(!matrix.length)return {name,score:0,headerRow:0,headers:[],rows:[]};
  let headerRow=0;let score=-1;
  for(let index=0;index<Math.min(20,matrix.length);index++){const next=headerScore(matrix[index]??[]);if(next>score){score=next;headerRow=index;}}
  const rawHeaders=(matrix[headerRow]??[]).map(text);
  const headers=rawHeaders.filter(Boolean);
  const rows=matrix.slice(headerRow+1).filter(row=>row.some(value=>text(value))).map(row=>Object.fromEntries(rawHeaders.map((header,index)=>[header,text(row[index])]).filter(([header])=>Boolean(header))));
  return {name,score,headerRow,headers,rows};
}

export function TenderImportPanel({canImport,demo=false,onDemoImport}:{canImport:boolean;demo?:boolean;onDemoImport?:(rows:TenderImportRow[])=>TenderImportResult}){
  const router=useRouter();
  const [open,setOpen]=useState(false);const [rows,setRows]=useState<Row[]>([]);const [headers,setHeaders]=useState<string[]>([]);const [mapping,setMapping]=useState<Partial<Record<Field,string>>>({});
  const [fileName,setFileName]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [book,setBook]=useState<XLSX.WorkBook|null>(null);const [sheetNames,setSheetNames]=useState<string[]>([]);const [selectedSheet,setSelectedSheet]=useState("");const [headerRow,setHeaderRow]=useState(0);

  const mapped=useMemo<TenderImportRow[]>(()=>rows.map(row=>{
    const sourceUrl=text(row[mapping.sourceUrl??""]);
    const procedure=normalizeProcedure(text(row[mapping.procedureNumber??""]),sourceUrl);
    return {
      title:text(row[mapping.title??""]),
      customerName:text(row[mapping.customerName??""])||null,
      platform:inferPlatform(sourceUrl,text(row[mapping.platform??""]))||null,
      procedureNumber:procedure||null,
      sourceUrl:sourceUrl||null,
      publicationDate:parseDay(text(row[mapping.publicationDate??""])),
      submissionDeadline:parseDate(text(row[mapping.submissionDeadline??""])),
      initialPrice:parseMoney(text(row[mapping.initialPrice??""])),
      comment:text(row[mapping.comment??""])||null,
      sourceName:`Импорт · ${fileName||"таблица"} · ${selectedSheet||"лист"}`,
    };
  }).filter(row=>row.title),[rows,mapping,fileName,selectedSheet]);
  const invalidDeadline=rows.filter(row=>mapping.submissionDeadline&&text(row[mapping.submissionDeadline])&&!parseDate(text(row[mapping.submissionDeadline]))).length;

  function applySheet(workbook:XLSX.WorkBook,name:string){
    const analysis=analyzeSheet(workbook,name);setSelectedSheet(name);setHeaders(analysis.headers);setRows(analysis.rows);setMapping(autoMap(analysis.headers));setHeaderRow(analysis.headerRow+1);
    if(analysis.score<2)setMessage("Не удалось уверенно определить строку заголовков. Проверьте выбранный лист и сопоставление колонок вручную.");else setMessage("");
  }
  function downloadTemplate(){
    const data=[["Название","Заказчик","Площадка","Номер торга","Ссылка","Дата публикации","Срок","Цена в ₽","Комментарий"],["Пример: Линейный персонал","ООО Заказчик","B2B-Center","12345","https://example.com","09.09.2026","14.09.2026 10:00","8400000","Короткая заметка"]];
    const sheet=XLSX.utils.aoa_to_sheet(data);sheet["!cols"]=[{wch:42},{wch:28},{wch:20},{wch:20},{wch:42},{wch:18},{wch:22},{wch:18},{wch:34}];const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,"Тендеры");XLSX.writeFile(workbook,"OPERIS_шаблон_тендеров.xlsx");
  }
  async function readFile(file:File){
    setMessage("");setFileName(file.name);const buffer=await file.arrayBuffer();const workbook=XLSX.read(buffer,{type:"array",cellDates:true});setBook(workbook);setSheetNames(workbook.SheetNames);
    const analyses=workbook.SheetNames.map(name=>analyzeSheet(workbook,name)).sort((a,b)=>b.score-a.score||b.rows.length-a.rows.length);
    const best=analyses[0];if(!best){setMessage("В таблице нет данных");return;}applySheet(workbook,best.name);
  }
  async function submit(){
    if(!mapping.title){setMessage("Сопоставьте колонку «Название тендера»");return;}if(!mapped.length){setMessage("Нет строк, готовых к импорту");return;}setBusy(true);setMessage("");
    if(demo&&onDemoImport){const result=onDemoImport(mapped);setBusy(false);setMessage(`Импортировано: ${result.imported}. Пропущено как дубли: ${result.skipped}.`);if(result.imported>0)setTimeout(()=>setOpen(false),900);return;}
    const response=await fetch("/api/tenders/import",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({rows:mapped})});const json=await response.json().catch(()=>({}));setBusy(false);if(!response.ok){setMessage(json.error??"Не удалось импортировать тендеры");return;}setMessage(`Импортировано: ${json.imported?.length??0}. Пропущено как дубли: ${json.skipped?.length??0}.`);router.refresh();if((json.imported?.length??0)>0)setTimeout(()=>setOpen(false),900);
  }
  if(!canImport)return null;
  return <><button className="button" type="button" onClick={()=>setOpen(true)}><Upload size={14}/> Загрузить Excel</button>{open&&<div className="drawer-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false)}}><aside className="drawer tender-import-drawer"><div className="drawer-head"><div><strong>Импорт тендеров</strong><span>Excel / XLSX / XLS / CSV. Перед загрузкой показываем сопоставление и предпросмотр.</span></div><button type="button" className="icon-button" onClick={()=>setOpen(false)} aria-label="Закрыть"><X size={16}/></button></div><div className="drawer-body">
    <div className="tender-import-drop"><FileSpreadsheet size={28}/><strong>{fileName||"Выберите таблицу с тендерами"}</strong><span>Можно использовать вашу рабочую таблицу: OPERIS сам ищет строку заголовков, предлагает подходящий лист и сопоставляет известные колонки.</span><label className="button"><Upload size={14}/> Выбрать файл<input hidden type="file" accept=".xlsx,.xls,.csv" onChange={event=>{const file=event.target.files?.[0];if(file)void readFile(file)}}/></label><button type="button" className="button ghost" onClick={downloadTemplate}><Download size={14}/> Скачать шаблон Excel</button></div>
    {sheetNames.length>1&&<div className="tender-import-section"><h4>Лист таблицы</h4><div className="tender-sheet-picker"><select value={selectedSheet} onChange={event=>{if(book)applySheet(book,event.target.value)}}>{sheetNames.map(name=><option key={name} value={name}>{name}</option>)}</select><span>Заголовки определены в строке {headerRow}. Можно выбрать другой лист вручную.</span></div></div>}
    {headers.length>0&&<><div className="tender-import-section"><h4>Сопоставление колонок</h4><div className="tender-mapping-grid">{fields.map(field=><label key={field.key}><span>{field.label}{field.required?" *":""}</span><select value={mapping[field.key]??""} onChange={event=>setMapping(current=>({...current,[field.key]:event.target.value||undefined}))}><option value="">Не загружать</option>{headers.map(header=><option key={header} value={header}>{header}</option>)}</select></label>)}</div></div><div className="tender-import-section"><h4>Предпросмотр</h4><p className="muted">Лист: {selectedSheet} · строк: {rows.length} · готовы: {mapped.length}{invalidDeadline?` · не распознано сроков: ${invalidDeadline}`:""}</p><div className="grid-scroll"><table className="data-table"><thead><tr><th>Тендер</th><th>Заказчик</th><th>Площадка</th><th>Номер</th><th>Подача до</th></tr></thead><tbody>{mapped.slice(0,8).map((row,index)=><tr key={`${row.title}-${index}`}><td>{row.title}</td><td>{row.customerName??"—"}</td><td>{row.platform??"—"}</td><td>{row.procedureNumber??"—"}</td><td>{row.submissionDeadline?new Date(row.submissionDeadline).toLocaleString("ru-RU"):"—"}</td></tr>)}</tbody></table></div></div></>}
    {message&&<p className={message.startsWith("Импортировано")?"form-success":"form-error"}>{message}</p>}
    {demo&&<p className="tender-form-note">В демо-режиме импорт добавит строки только в этот браузер. В рабочем режиме те же данные проходят серверную проверку дублей и сохраняются в PostgreSQL.</p>}
  </div><div className="drawer-footer"><button className="button" type="button" onClick={()=>setOpen(false)}>Отмена</button><button className="button primary" type="button" disabled={busy||mapped.length===0} onClick={submit}>{busy?"Импорт…":`Импортировать ${mapped.length||""}`}</button></div></aside></div>}</>;
}
