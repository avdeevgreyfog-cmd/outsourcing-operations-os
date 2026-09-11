"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Download, Plus, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { SalesDrawer, SalesEmpty, SalesMetrics, SalesSearch, SalesSegments } from "@/components/sales/SalesUI";
import type { RateMemoryRow } from "@/lib/commercial/rate-references";

const STORAGE_KEY = "operis.rate-memory.v1";
const STORAGE_EVENT = "operis:rate-memory";
const templateHeaders = [
  "Специальность","Регион","Ценовая зона","Модель оформления","График","Проживание","Развозка","Единица","Тип выплаты",
  "Сотруднику мин","Сотруднику макс","Себестоимость мин","Себестоимость макс","Клиенту мин без НДС","Клиенту макс без НДС",
  "Маржа мин, %","Маржа макс, %","Источник","Статус источника","Дата источника","Комментарий",
];

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const norm = (value: unknown) => String(value ?? "").trim();
const normalizedHeader = (value: string) => value.toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ").trim();
const numberValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/\s/g,"").replace(",","."));
  return Number.isFinite(parsed) ? parsed : null;
};
const booleanValue = (value: unknown): boolean | null => {
  const text = norm(value).toLowerCase();
  if (!text) return null;
  if (["да","yes","true","1","включено"].includes(text)) return true;
  if (["нет","no","false","0","не включено"].includes(text)) return false;
  return null;
};
const isoDate = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
  const text = norm(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[.\/]([0-1]?\d)[.\/](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`;
  return "";
};
const dateTime = (value: string) => {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : isoDate(value);
  if (!iso) return 0;
  const time = new Date(`${iso}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
};
const dateLabel = (value: string) => {
  const time = dateTime(value);
  return time ? new Intl.DateTimeFormat("ru-RU").format(new Date(time)) : value || "—";
};
const unitLabel = (unit: string) => {
  const value = unit.toLowerCase();
  if (["hour","ч","час","₽/ч"].includes(value)) return "₽/ч";
  if (["shift","смена","₽/смену"].includes(value)) return "₽/смену";
  if (["month","мес","месяц","₽/мес"].includes(value)) return "₽/мес";
  return unit || "₽/ч";
};
const rangeLabel = (min: number | null | undefined, max: number | null | undefined, suffix = "") => {
  const safeMin = min != null && Number.isFinite(min) ? min : null;
  const safeMax = max != null && Number.isFinite(max) ? max : null;
  if (safeMin == null && safeMax == null) return "—";
  if (safeMin != null && safeMax != null && safeMin !== safeMax) return `${money.format(safeMin)}–${money.format(safeMax)}${suffix}`;
  return `${money.format(safeMin ?? safeMax ?? 0)}${suffix}`;
};
const rangeBounds = (values: Array<number | null | undefined>): [number | null, number | null] => {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length ? [Math.min(...finite), Math.max(...finite)] : [null,null];
};
const sourceLabels: Record<string,string> = { calculation:"Расчёт", proposal:"КП", object:"Факт объекта", import:"Импорт", manual:"Ручной ориентир", reference:"Ориентир" };
const sourceStatusLabels: Record<string,string> = {
  historical:"Исторические данные",
  reference:"Ориентир",
  approved:"Согласовано",
  accepted:"Принято клиентом",
  sent:"Отправлено клиенту",
  actual:"Фактические данные",
  draft:"Черновик",
};
const sourceStatusLabel = (value: string) => sourceStatusLabels[value.toLowerCase()] ?? "Источник данных";

function parseImportRow(raw: Record<string, unknown>, index: number, fallbackDate: string): { row?: RateMemoryRow; error?: string } {
  const values = new Map(Object.entries(raw).map(([key,value]) => [normalizedHeader(key), value]));
  const get = (...names: string[]) => {
    for (const name of names) { const value = values.get(normalizedHeader(name)); if (value !== undefined && value !== "") return value; }
    return "";
  };
  const specialty = norm(get("Специальность","specialty","Профессия"));
  const workerMin = numberValue(get("Сотруднику мин","Ставка сотруднику мин","worker min"));
  const workerMax = numberValue(get("Сотруднику макс","Ставка сотруднику макс","worker max"));
  const clientMin = numberValue(get("Клиенту мин без НДС","Ставка клиенту мин","client min"));
  const clientMax = numberValue(get("Клиенту макс без НДС","Ставка клиенту макс","client max"));
  if (!specialty) return { error: `Строка ${index + 2}: не указана специальность` };
  if (workerMin == null && workerMax == null && clientMin == null && clientMax == null) return { error: `Строка ${index + 2}: нужна хотя бы одна ставка сотруднику или клиенту` };
  const region = norm(get("Регион","region")) || "Без региона";
  return { row: {
    id: `local-${crypto.randomUUID()}`, organizationId: "demo", specialty, region, priceZone: norm(get("Ценовая зона","price zone")) || region,
    employmentModel: norm(get("Модель оформления","Модель","employment model")) || "Не указано",
    amountMin: workerMin ?? workerMax, amountMax: workerMax ?? workerMin, unit: norm(get("Единица","unit")) || "hour",
    grossNet: norm(get("Тип выплаты","Тип","pay semantics")) || "На руки", source: norm(get("Источник","source")) || "Импорт компании",
    sourceType: "import", sourceStatus: norm(get("Статус источника","source status")) || "historical", sourceDate: isoDate(get("Дата источника","Дата","source date")) || fallbackDate,
    confidence: "imported", comment: norm(get("Комментарий","comment")) || null, scheduleLabel: norm(get("График","schedule")) || null,
    housingIncluded: booleanValue(get("Проживание","housing")), shuttleIncluded: booleanValue(get("Развозка","shuttle")),
    fullCostMin: numberValue(get("Себестоимость мин","cost min")), fullCostMax: numberValue(get("Себестоимость макс","cost max")),
    clientRateMin: clientMin ?? clientMax, clientRateMax: clientMax ?? clientMin,
    marginMin: numberValue(get("Маржа мин, %","margin min")), marginMax: numberValue(get("Маржа макс, %","margin max")),
  }};
}

function conditions(row: RateMemoryRow) {
  const parts = [row.employmentModel, row.scheduleLabel].filter(Boolean);
  if (row.housingIncluded === true) parts.push("с проживанием");
  else if (row.housingIncluded === false) parts.push("без проживания");
  if (row.shuttleIncluded === true) parts.push("с развозкой");
  return parts.join(" · ") || "Условия не зафиксированы";
}

export function RatesWorkspace({ initialRows, demo, canManage, now, today }: { initialRows: RateMemoryRow[]; demo: boolean; canManage: boolean; now: number; today: string }) {
  const [rows, setRows] = useState(initialRows);
  const [view, setView] = useState<"summary"|"history">("summary");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [model, setModel] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [selected, setSelected] = useState<RateMemoryRow[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ rows: RateMemoryRow[]; errors: string[]; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!demo) return;
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as RateMemoryRow[];
        if (Array.isArray(saved) && saved.length) setRows([...saved, ...initialRows.filter(base => !saved.some(item => item.id === base.id))]);
      } catch { /* ignore damaged demo storage */ }
    },0);
    return () => window.clearTimeout(timer);
  }, [demo, initialRows]);

  const persistDemo = (next: RateMemoryRow[]) => {
    const local = next.filter(row => row.id.startsWith("local-"));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    window.dispatchEvent(new Event(STORAGE_EVENT));
  };

  const filtered = useMemo(() => rows.filter(row => {
    if (region !== "all" && row.region !== region) return false;
    if (model !== "all" && row.employmentModel !== model) return false;
    if (sourceType !== "all" && row.sourceType !== sourceType) return false;
    const haystack = `${row.specialty} ${row.region} ${row.priceZone ?? ""} ${row.source} ${row.comment ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }), [rows, region, model, sourceType, query]);

  const summary = useMemo(() => {
    const map = new Map<string, RateMemoryRow[]>();
    for (const row of filtered) {
      const key = `${row.specialty}__${row.priceZone || row.region}`;
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return [...map.entries()].map(([key, items]) => {
      const sorted = [...items].sort((a,b) => dateTime(b.sourceDate) - dateTime(a.sourceDate));
      const latest = sorted[0];
      const [workerMin] = rangeBounds(items.map(item => item.amountMin));
      const [,workerMax] = rangeBounds(items.map(item => item.amountMax));
      const [clientMin] = rangeBounds(items.map(item => item.clientRateMin));
      const [,clientMax] = rangeBounds(items.map(item => item.clientRateMax));
      return { key, items: sorted, latest, specialty: latest.specialty, zone: latest.priceZone || latest.region, workerMin, workerMax, clientMin, clientMax };
    }).sort((a,b) => a.specialty.localeCompare(b.specialty,"ru"));
  }, [filtered]);

  const regions = useMemo(() => [...new Set(rows.map(row => row.region))].sort((a,b)=>a.localeCompare(b,"ru")), [rows]);
  const models = useMemo(() => [...new Set(rows.map(row => row.employmentModel))].sort((a,b)=>a.localeCompare(b,"ru")), [rows]);
  const fresh = rows.filter(row => now - dateTime(row.sourceDate) < 180 * 86400000).length;
  const selectedWorkerRange = rangeBounds(selected?.flatMap(row => [row.amountMin,row.amountMax]) ?? []);
  const selectedClientRange = rangeBounds(selected?.flatMap(row => [row.clientRateMin,row.clientRateMax]) ?? []);
  const metrics = [
    { label:"Специальностей", value:new Set(rows.map(row=>row.specialty)).size, note:"с накопленной историей" },
    { label:"Наблюдений", value:rows.length, note:"расчёты, импорт и ориентиры" },
    { label:"Регионов", value:new Set(rows.map(row=>row.region)).size, note:"реальные географические срезы" },
    { label:"Актуальных", value:fresh, note:"обновлялись за последние 180 дней" },
  ];

  function downloadTemplate() {
    const workbook = XLSX.utils.book_new();
    const importSheet = XLSX.utils.aoa_to_sheet([templateHeaders]);
    const instruction = XLSX.utils.aoa_to_sheet([
      ["Поле","Обязательность","Пояснение"],
      ["Специальность","Да","Название профессии/специальности. Минимально обязательное поле."],
      ["Сотруднику мин / макс","Нет*","Можно загрузить только ставку сотруднику. *Нужна хотя бы одна ставка сотруднику или клиенту."],
      ["Клиенту мин / макс без НДС","Нет*","Можно загрузить только коммерческую ставку, если выплаты сотруднику неизвестны."],
      ["Регион / Ценовая зона","Нет","Если нет региона, запись сохранится как общий исторический ориентир."],
      ["График / Проживание / Развозка","Нет","Чем больше условий заполнено, тем точнее сопоставление будущих заявок."],
      ["Модель оформления","Нет","Например: ТК, ГПХ, НПД."],
      ["Источник / Статус источника / Дата","Нет","Например: старый расчёт, принятое КП, факт объекта. Неполные строки не отбрасываются."],
      ["Остальные поля","Нет","Себестоимость и маржа используются для расширенной аналитики, если они известны."],
    ]);
    XLSX.utils.book_append_sheet(workbook, importSheet, "Импорт");
    XLSX.utils.book_append_sheet(workbook, instruction, "Инструкция");
    XLSX.writeFile(workbook, "OPERIS_шаблон_базы_ставок.xlsx");
  }

  async function readImport(file: File) {
    setMessage("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:true });
      const first = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string,unknown>>(first, { defval:"" });
      const parsed = raw.map((item,index)=>parseImportRow(item,index,today));
      setPreview({ rows: parsed.flatMap(item => item.row ? [item.row] : []), errors: parsed.flatMap(item => item.error ? [item.error] : []), name:file.name });
    } catch {
      setMessage("Не удалось прочитать файл. Используйте XLSX/XLS/CSV и не удаляйте заголовок «Специальность».");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function commitRows(nextRows: RateMemoryRow[]) {
    if (!nextRows.length) return;
    if (demo) {
      const next = [...nextRows, ...rows]; setRows(next); persistDemo(next); setMessage(`Добавлено записей: ${nextRows.length}. Данные сохраняются в демо-контуре этого браузера.`); return true;
    }
    const response = await fetch("/api/rates/import", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ rows: nextRows }) });
    const result = await response.json().catch(()=>({}));
    if (!response.ok) { setMessage(result.error ?? "Не удалось загрузить ставки"); return false; }
    const created = Array.isArray(result.rows) ? result.rows as RateMemoryRow[] : nextRows;
    setRows(current => [...created, ...current]); setMessage(`Добавлено записей: ${created.length}.`); return true;
  }

  async function applyPreview() {
    if (!preview) return;
    const ok = await commitRows(preview.rows);
    if (ok) setPreview(null);
  }

  async function addManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const specialty = norm(form.get("specialty"));
    const workerMin = numberValue(form.get("workerMin"));
    const clientMin = numberValue(form.get("clientMin"));
    if (!specialty || (workerMin == null && clientMin == null)) { setMessage("Укажите специальность и хотя бы одну ставку: сотруднику или клиенту."); return; }
    const regionName = norm(form.get("region")) || "Без региона";
    const row: RateMemoryRow = {
      id:`local-${crypto.randomUUID()}`,organizationId:"demo",specialty,region:regionName,priceZone:norm(form.get("priceZone"))||regionName,
      employmentModel:norm(form.get("employmentModel"))||"Не указано",amountMin:workerMin,amountMax:numberValue(form.get("workerMax"))??workerMin,unit:norm(form.get("unit"))||"hour",
      grossNet:"На руки",source:norm(form.get("source"))||"Ручной ориентир",sourceType:"manual",sourceStatus:"reference",sourceDate:isoDate(form.get("sourceDate"))||today,confidence:"manual",comment:norm(form.get("comment"))||null,
      scheduleLabel:norm(form.get("schedule"))||null,housingIncluded:booleanValue(form.get("housing")),shuttleIncluded:null,clientRateMin:clientMin,clientRateMax:numberValue(form.get("clientMax"))??clientMin,
    };
    const ok = await commitRows([row]); if (ok) setAddOpen(false);
  }

  const resetFilters = () => { setQuery(""); setRegion("all"); setModel("all"); setSourceType("all"); };

  return <div className="rates-workspace">
    <SalesMetrics label="Сводка базы ставок" items={metrics}/>
    {demo&&<div className="rates-demo-note"><strong>Демо-контур.</strong><span>Импортированные и ручные ориентиры сохраняются в этом браузере.</span></div>}
    <div className="rates-toolbar-primary">
      <SalesSegments label="Представление" value={view} onChange={setView} items={[{value:"summary",label:"Сводка"},{value:"history",label:"История наблюдений"}]}/>
      <div className="rates-actions">
        <button className="button" type="button" onClick={downloadTemplate}><Download size={15}/> Шаблон импорта</button>
        {canManage&&<><input ref={fileRef} className="rates-file-input" type="file" accept=".xlsx,.xls,.csv" onChange={event=>{const file=event.target.files?.[0];if(file)void readImport(file);}}/><button className="button" type="button" onClick={()=>fileRef.current?.click()}><Upload size={15}/> Импорт</button><button className="button primary" type="button" onClick={()=>setAddOpen(true)}><Plus size={15}/> Добавить ориентир</button></>}
      </div>
    </div>
    <div className="rates-filterbar">
      <div className="rates-filters">
        <label>Регион<select value={region} onChange={event=>setRegion(event.target.value)}><option value="all">Все регионы</option>{regions.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Модель<select value={model} onChange={event=>setModel(event.target.value)}><option value="all">Все модели</option>{models.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Источник<select value={sourceType} onChange={event=>setSourceType(event.target.value)}><option value="all">Все источники</option><option value="object">Факт объекта</option><option value="proposal">КП</option><option value="calculation">Расчёт</option><option value="import">Импорт</option><option value="manual">Ручной</option></select></label>
      </div>
      <SalesSearch value={query} onChange={setQuery} placeholder="Поиск по специальности, региону или источнику"/>
    </div>

    {message&&<div className="rates-message">{message}</div>}
    {preview&&<div className="rates-import-preview"><div><strong>{preview.name}</strong><span>Готово к импорту: {preview.rows.length}{preview.errors.length?` · пропущено: ${preview.errors.length}`:""}</span>{preview.errors.slice(0,3).map(error=><small key={error}>{error}</small>)}</div><div><button className="button primary" disabled={!preview.rows.length} onClick={()=>void applyPreview()}>Импортировать {preview.rows.length}</button><button className="button" onClick={()=>setPreview(null)}>Отмена</button></div></div>}

    {view==="summary" ? <div className="request-table-wrap rates-table-wrap">{summary.length?<table className="data-table rates-summary-table"><thead><tr><th>Специальность</th><th>Ценовая зона</th><th>Базовые условия</th><th>Сотруднику</th><th>Клиенту без НДС</th><th>Наблюдений</th><th>Обновлено</th></tr></thead><tbody>{summary.map(group=><tr key={group.key} onClick={()=>setSelected(group.items)} tabIndex={0} onKeyDown={event=>{if(event.key==="Enter")setSelected(group.items)}}><td><strong>{group.specialty}</strong><span className="cell-sub">{group.latest.region}</span></td><td>{group.zone}</td><td>{conditions(group.latest)}</td><td className="num">{rangeLabel(group.workerMin,group.workerMax,` ${unitLabel(group.latest.unit)}`)}</td><td className="num">{rangeLabel(group.clientMin,group.clientMax,` ${unitLabel(group.latest.unit)}`)}</td><td className="num">{group.items.length}</td><td>{dateLabel(group.latest.sourceDate)}</td></tr>)}</tbody></table>:<SalesEmpty onReset={resetFilters}/>}</div>
    : <div className="request-table-wrap rates-table-wrap">{filtered.length?<table className="data-table rates-history-table"><thead><tr><th>Специальность</th><th>Регион / зона</th><th>Условия</th><th>Сотруднику</th><th>Себестоимость</th><th>Клиенту</th><th>Источник</th><th>Дата</th></tr></thead><tbody>{[...filtered].sort((a,b)=>dateTime(b.sourceDate)-dateTime(a.sourceDate)).map(row=><tr key={row.id} onClick={()=>setSelected([row])} tabIndex={0} onKeyDown={event=>{if(event.key==="Enter")setSelected([row])}}><td><strong>{row.specialty}</strong><span className="cell-sub">{row.employmentModel}</span></td><td>{row.region}<span className="cell-sub">{row.priceZone||"—"}</span></td><td>{conditions(row)}</td><td className="num">{rangeLabel(row.amountMin,row.amountMax,` ${unitLabel(row.unit)}`)}</td><td className="num">{rangeLabel(row.fullCostMin,row.fullCostMax,` ${unitLabel(row.unit)}`)}</td><td className="num">{rangeLabel(row.clientRateMin,row.clientRateMax,` ${unitLabel(row.unit)}`)}</td><td>{sourceLabels[row.sourceType]||"Источник"}<span className="cell-sub">{row.source}</span></td><td>{dateLabel(row.sourceDate)}</td></tr>)}</tbody></table>:<SalesEmpty onReset={resetFilters}/>}</div>}

    {selected&&<SalesDrawer title={selected[0].specialty} subtitle={`${selected[0].priceZone||selected[0].region} · ${selected.length} наблюдений`} onClose={()=>setSelected(null)}><div className="rates-drawer-summary"><div><span>Сотруднику</span><strong>{rangeLabel(selectedWorkerRange[0],selectedWorkerRange[1],` ${unitLabel(selected[0].unit)}`)}</strong></div><div><span>Клиенту</span><strong>{rangeLabel(selectedClientRange[0],selectedClientRange[1],` ${unitLabel(selected[0].unit)}`)}</strong></div></div><div className="rates-drawer-list">{selected.map(row=><article key={row.id}><header><strong>{dateLabel(row.sourceDate)} · {sourceLabels[row.sourceType]||"Источник"}</strong><span>{sourceStatusLabel(row.sourceStatus)}</span></header><p>{conditions(row)}</p><dl><div><dt>Сотруднику</dt><dd>{rangeLabel(row.amountMin,row.amountMax,` ${unitLabel(row.unit)}`)}</dd></div><div><dt>Клиенту</dt><dd>{rangeLabel(row.clientRateMin,row.clientRateMax,` ${unitLabel(row.unit)}`)}</dd></div><div><dt>Источник</dt><dd>{row.source}</dd></div></dl>{row.comment&&<small>{row.comment}</small>}</article>)}</div></SalesDrawer>}

    {addOpen&&<SalesDrawer title="Новый ориентир" subtitle="Можно заполнить только известные данные. Остальные поля останутся пустыми." onClose={()=>setAddOpen(false)}><form className="rates-manual-form" onSubmit={event=>void addManual(event)}><label>Специальность<input className="input" name="specialty" required/></label><label>Регион<input className="input" name="region" placeholder="Москва и МО"/></label><label>Ценовая зона<input className="input" name="priceZone" placeholder="Если не указана, используется регион"/></label><label>Модель оформления<input className="input" name="employmentModel" placeholder="ТК / ГПХ / НПД"/></label><label>График<input className="input" name="schedule" placeholder="5/2 · 8 ч"/></label><label>Проживание<select name="housing" defaultValue=""><option value="">Не указано</option><option value="нет">Без проживания</option><option value="да">С проживанием</option></select></label><label>Единица<select name="unit" defaultValue="hour"><option value="hour">₽ / час</option><option value="shift">₽ / смена</option><option value="month">₽ / месяц</option></select></label><label>Сотруднику мин<input className="input" name="workerMin" type="number" min="0" step="0.01"/></label><label>Сотруднику макс<input className="input" name="workerMax" type="number" min="0" step="0.01"/></label><label>Клиенту мин без НДС<input className="input" name="clientMin" type="number" min="0" step="0.01"/></label><label>Клиенту макс без НДС<input className="input" name="clientMax" type="number" min="0" step="0.01"/></label><label>Дата источника<input className="input" name="sourceDate" type="date" defaultValue={today}/></label><label className="rates-form-wide">Источник<input className="input" name="source" placeholder="Старый расчёт, договор, опыт менеджера..."/></label><label className="rates-form-wide">Комментарий<textarea className="input" name="comment"/></label><div className="rates-form-actions"><button className="button primary" type="submit">Сохранить ориентир</button><button className="button" type="button" onClick={()=>setAddOpen(false)}>Отмена</button></div></form></SalesDrawer>}
  </div>;
}
