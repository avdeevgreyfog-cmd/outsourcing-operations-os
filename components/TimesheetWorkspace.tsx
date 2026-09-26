"use client";

import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from "react";
import {useRouter} from "next/navigation";
import {CheckCircle2,Download,Printer,RotateCcw,Send,ShieldCheck,WalletCards} from "lucide-react";
import {Status} from "@/components/UI";
import {rub} from "@/lib/ui/format";
import type {TimesheetAbsenceRange,TimesheetCellValue,TimesheetData,TimesheetRatePeriod,TimesheetWorkerRow} from "@/lib/data/service";
import type {OperationsReferenceData} from "@/lib/operations/service";

type Mode="first"|"second"|"month";
type View="client"|"internal";
type Segment="day"|"night";
type RowMode="auto"|"all"|"day"|"night";

export function TimesheetWorkspace({data,options,sensitive,canEdit,canSubmit,canReview,canApproveClient,canClose,embedded=false,pilot=false}:{data:TimesheetData;options:OperationsReferenceData;sensitive:boolean;canEdit:boolean;canSubmit:boolean;canReview:boolean;canApproveClient:boolean;canClose:boolean;embedded?:boolean;pilot?:boolean}){
  const router=useRouter();
  const tableWrapRef=useRef<HTMLDivElement>(null);
  const [mode,setMode]=useState<Mode>("month");
  const [view,setView]=useState<View>(sensitive?"internal":"client");
  const [rows,setRows]=useState<TimesheetWorkerRow[]>(data.rows);
  const [saving,setSaving]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [comment,setComment]=useState("");
  const [bulkBusy,setBulkBusy]=useState(false);
  const [rowMode,setRowMode]=useState<RowMode>("auto");
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [attentionOnly,setAttentionOnly]=useState(false);
  const [financeOpen,setFinanceOpen]=useState(false);

  const todayIso=new Date().toISOString().slice(0,10);
  const currentDay=data.month===todayIso.slice(0,7)?Number(todayIso.slice(8,10)):null;
  const lastDay=Number(data.periodEnd.slice(8,10));
  const allDays=useMemo(()=>range(1,lastDay),[lastDay]);
  const days=mode==="first"?allDays.filter(day=>day<=15):mode==="second"?allDays.filter(day=>day>=16):allDays;
  useEffect(()=>{tableWrapRef.current?.scrollTo({left:0,behavior:"auto"})},[mode,view]);
  const totals=useMemo(()=>rows.reduce((acc,row)=>{
    if(row.rowKind==="candidate")return acc;
    for(const day of days){
      const dayValue=row.dayCells?.[String(day)],nightValue=row.nightCells?.[String(day)];
      acc.dayHours+=numericCell(dayValue);acc.nightHours+=numericCell(nightValue);
      if(numericCell(dayValue)>0)acc.dayShifts++;if(numericCell(nightValue)>0)acc.nightShifts++;
      if(["НВ","Н"].includes(String(dayValue??""))||["НВ","Н"].includes(String(nightValue??"")))acc.noShows++;
    }
    return acc;
  },{dayHours:0,nightHours:0,dayShifts:0,nightShifts:0,noShows:0}),[rows,days]);

  const daySummary=useMemo(()=>Object.fromEntries(days.map(day=>{
    const date=dateString(data.month,day);
    const planned=Number(data.planByDay?.[date]??0);
    let worked=0,hours=0;
    for(const row of rows){
      if(row.rowKind==="candidate")continue;
      const key=String(day);
      const dayValue=row.dayCells?.[key],nightValue=row.nightCells?.[key];
      const fact=numericCell(dayValue)+numericCell(nightValue);
      if(fact>0||dayValue==="?"||nightValue==="?")worked++;
      hours+=fact;
    }
    return [day,{planned,worked,hours}];
  })),[rows,days,data.month,data.planByDay]);
  const detailTotals=useMemo(()=>rows.reduce((acc,row)=>{
    if(row.rowKind==="candidate")return acc;
    acc.daysOff+=countWorkerCode(row,"В",days);
    acc.sick+=countWorkerCode(row,"Б",days);
    acc.noShows+=countWorkerNoShows(row,days);
    return acc;
  },{daysOff:0,sick:0,noShows:0}),[rows,days]);
  const totalHours=totals.dayHours+totals.nightHours;
  const attentionCount=useMemo(()=>rows.filter(row=>row.rowKind!=="candidate"&&rowNeedsAttention(row,days,data.month,todayIso)).length,[rows,days,data.month,todayIso]);
  const visibleRows=useMemo(()=>attentionOnly?rows.filter(row=>row.rowKind!=="candidate"&&rowNeedsAttention(row,days,data.month,todayIso)):rows,[rows,attentionOnly,days,data.month,todayIso]);
  const internal=data.internalSnapshot,client=data.clientSnapshot;
  const locked=internal?.status==="internal_submitted"||internal?.status==="internal_checked"||internal?.status==="closed"||client?.status==="client_sent"||client?.status==="client_approved"||client?.status==="closed";
  const canEditFact=canEdit&&view==="internal"&&!locked;

  function changeContext(objectId:string,month:string){
    const params=new URLSearchParams();if(!embedded&&objectId)params.set("object",objectId);if(month)params.set("month",month);
    if(embedded)params.set("ui",pilot?"pilot":"classic");
    router.push(embedded?`/objects/${data.objectId}?tab=timesheets&${params.toString()}`:"/timesheets?"+params.toString());
  }

  async function persistCell(workerId:string,day:number,value:string,segment:Segment,quiet=false){
    const date=dateString(data.month,day);
    const row=rows.find(item=>item.workerId===workerId&&rowCoversDate(item,date));
    if(!canEditFact||!row||row.rowKind==="candidate"||isAfterEnd(row,date))return false;
    const key=`${workerId}:${day}:${segment}`;
    if(!quiet){setSaving(key);setMessage("")}
    try{
      const response=await fetch("/api/timesheets/entries",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workerId,objectId:data.objectId,workDate:date,value,segment})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить");
      const normalized=normalizeCell(value);
      setRows(current=>current.map(item=>item.workerId!==workerId||!rowCoversDate(item,date)?item:{...item,[segment==="day"?"dayCells":"nightCells"]:{...(segment==="day"?item.dayCells:item.nightCells),[String(day)]:normalized}}));
      if(!quiet)setMessage("Изменение сохранено");
      return true;
    }catch(error){
      if(!quiet)setMessage(error instanceof Error?error.message:"Не удалось сохранить");
      return false;
    }finally{if(!quiet)setSaving("")}
  }

  function handleCellKeyDown(event:KeyboardEvent<HTMLInputElement>){
    if(event.key!=="Enter")return;
    event.preventDefault();
    const cells=[...document.querySelectorAll<HTMLInputElement>(".timesheet-cell-input:not(:disabled)")];
    const index=cells.indexOf(event.currentTarget);
    if(index<0)return;
    const next=cells[index+(event.shiftKey?-1:1)];
    event.currentTarget.blur();
    if(next)requestAnimationFrame(()=>{next.focus();next.select()});
  }

  async function bulkToday(action:"confirm"|"hours"){
    if(!currentDay||!canEditFact)return;
    setBulkBusy(true);setMessage("");
    try{
      let done=0;
      for(const row of rows){
        if(row.rowKind==="candidate")continue;
        for(const segment of ["day","night"] as Segment[]){
          const cell=(segment==="day"?row.dayCells:row.nightCells)?.[String(currentDay)];
          const plannedKind=row.plannedShiftKinds?.[String(currentDay)];
          if(action==="confirm"&&cell==="П"){
            if(await persistCell(row.workerId,currentDay,"?",segment,true))done++;
          }else if(action==="hours"&&cell==="?"&&Number(row.plannedHours??0)>0&&(plannedKind===segment||plannedKind==="mixed")){
            if(await persistCell(row.workerId,currentDay,String(row.plannedHours),segment,true))done++;
          }
        }
      }
      setMessage(action==="confirm"?`Подтверждено выходов: ${done}`:`Нормативные часы заполнены: ${done}`);
    }finally{setBulkBusy(false)}
  }

  async function workflow(action:"submit_internal"|"review_internal"|"return_internal"|"send_client"|"client_approve"|"client_return"|"close"){
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/timesheets/workflow",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,objectId:data.objectId,periodStart:data.periodStart,periodEnd:data.periodEnd,comment:comment||null})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось выполнить действие");
      const labels:Record<string,string>={submit_internal:"Табель передан на внутреннюю проверку",review_internal:"Внутренний табель проверен",return_internal:"Табель возвращён менеджеру",send_client:"Клиентская версия зафиксирована и отправлена",client_approve:"Подтверждение клиента зафиксировано",client_return:"Возврат клиента зафиксирован",close:"Период закрыт: начисления сформированы"};
      setMessage(labels[action]??"Готово");setComment("");router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось выполнить действие")}
    finally{setBusy(false)}
  }

  async function exportExcel(){
    const finance=view==="internal"&&sensitive;
    const header=["Сотрудник","Специальность","Смена",...(finance?["Ставка"]:[]),...days.map(day=>String(day).padStart(2,"0")+"."+data.month.slice(5,7)),"Смен","Часов","Выходные","Больничные","Прогулы",...(finance?["Начислено","Начислено всего","Корректировки","Выплачено","К выплате"]:[])];
    const body=rows.flatMap(row=>(["day","night"] as Segment[]).map((segment,index)=>{
      const cells=segment==="day"?row.dayCells:row.nightCells;
      const shiftHours=days.reduce((sum,day)=>sum+numericCell(cells?.[String(day)]),0);
      const shiftCount=days.filter(day=>numericCell(cells?.[String(day)])>0).length;
      const segmentAccrued=calculateSegmentAccrued(row,segment,days,data.month);
      const earned=mode==="month"?(row.accrualTotal??row.calculatedAccrual??0):calculateSegmentAccrued(row,"day",days,data.month)+calculateSegmentAccrued(row,"night",days,data.month);
      const correction=mode==="month"?Number(row.premium??0)+Number(row.adjustment??0):"";
      return [index===0?row.name:"",index===0?specialtyText(row):"",segment==="day"?"День":"Ночь",...(finance?[rateTextForExport(row,segment,data.month)]:[]),...days.map(day=>cellDisplay(row,day,segment,data.month)),shiftCount,shiftHours,index===0?countWorkerCode(row,"В",days):"",index===0?countWorkerCode(row,"Б",days):"",index===0?countWorkerNoShows(row,days):"",...(finance?[segmentAccrued,index===0?earned:"",index===0?correction:"",index===0&&mode==="month"?row.paidAmount??0:"",index===0&&mode==="month"?row.payableAmount??earned:""]:[])];
    }));
    const XLSX=await import("xlsx");
    const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([header,...body]);XLSX.utils.book_append_sheet(wb,ws,"Табель");
    XLSX.writeFile(wb,`Табель_${data.object}_${data.month}_${view==="client"?"согласование":"рабочий"}.xlsx`);
  }

  return <div className={`timesheet-workspace ${pilot?"timesheet-pilot":"timesheet-classic"}`}>
    <div className={`object-local-tabs timesheet-local-tabs ${pilot?"timesheet-local-tabs-forced":""}`} role="tablist" aria-label="Режим табеля">{sensitive&&<button type="button" className={view==="internal"?"active":""} onClick={()=>setView("internal")}>Рабочий табель <span>{rows.filter(row=>row.rowKind!=="candidate").length}</span></button>}<button type="button" className={view==="client"?"active":""} onClick={()=>setView("client")}>Согласование <span>{statusLabel(data.status)}</span></button><button type="button" className={attentionOnly?"active":""} onClick={()=>setAttentionOnly(value=>!value)}>Требует внимания <span>{attentionCount}</span></button></div>
    <div className="timesheet-controlbar">
      <div className="timesheet-control-group timesheet-control-context">
        <span className="timesheet-control-label">Период</span>
        {!embedded&&<select value={data.objectId} onChange={event=>changeContext(event.target.value,data.month)}>{options.objects.map(object=><option key={object.id} value={object.id}>{object.name}</option>)}</select>}
        <input type="month" value={data.month} onChange={event=>changeContext(data.objectId,event.target.value)}/>
        <div className="segmented">{(["first","second","month"] as Mode[]).map(value=><button type="button" key={value} className={mode===value?"active":""} onClick={()=>setMode(value)}>{value==="first"?"1–15":value==="second"?"16–конец":"Весь месяц"}</button>)}</div>
      </div>
      <div className="timesheet-control-divider"/>
      <div className="timesheet-control-group">
        <span className="timesheet-control-label">Строки</span>
        <div className="segmented">
          {(["auto","day","night","all"] as RowMode[]).map(value=><button type="button" key={value} className={rowMode===value?"active":""} onClick={()=>setRowMode(value)}>{value==="auto"?"Авто":value==="day"?"День":value==="night"?"Ночь":"Все"}</button>)}
        </div>
      </div>
      <div className="timesheet-control-spacer"/>
      <div className={`timesheet-control-group timesheet-control-view ${pilot?"timesheet-control-view-classic-hidden":""}`}>
        <span className="timesheet-control-label">Вид</span>
        <div className="segmented"><button type="button" className={view==="client"?"active":""} onClick={()=>setView("client")}>Согласование</button>{sensitive&&<button type="button" className={view==="internal"?"active":""} onClick={()=>setView("internal")}>Рабочий</button>}</div>
      </div>
      <div className="timesheet-control-actions">
        <button className="button" onClick={()=>void exportExcel()}><Download size={14}/> Excel</button>
        {view==="client"&&<button className="button" onClick={()=>window.print()}><Printer size={14}/> Печать</button>}
        {view==="internal"&&currentDay&&canEditFact&&<><button className="button" disabled={bulkBusy} onClick={()=>void bulkToday("confirm")}>Подтвердить П</button><button className="button" disabled={bulkBusy} onClick={()=>void bulkToday("hours")}>Заполнить часы</button></>}
      </div>
    </div>

    <details className={`timesheet-legend timesheet-legend-top timesheet-legend-collapsible ${pilot?"timesheet-legend-collapsible-forced":""}`}><summary>Обозначения табеля</summary><div><span><b>11</b> фактические часы</span><span><b>П</b> план</span><span><b>?</b> вышел, часы не закрыты</span><span><b>В</b> выходной</span><span><b>МВ</b> межвахта</span><span><b>О</b> отпуск</span><span><b>Б</b> больничный</span><span><b>НВ</b> прогул / невыход</span><span><b>УВ</b> работа завершена</span>{view==="internal"&&sensitive&&<span className="timesheet-legend-note">При смене специальности или ставки сотрудник показывается отдельной строкой с даты новых условий.</span>}</div></details>
    <div className={`timesheet-legend timesheet-legend-top timesheet-legend-classic ${pilot?"timesheet-legend-classic-hidden":""}`}><strong>Обозначения</strong><span><b>11</b> фактические часы</span><span><b>П</b> план</span><span><b>?</b> вышел, часы не закрыты</span><span><b>В</b> выходной</span><span><b>МВ</b> межвахта</span><span><b>О</b> отпуск</span><span><b>Б</b> больничный</span><span><b>НВ</b> прогул / невыход</span><span><b>УВ</b> работа завершена</span>{view==="internal"&&sensitive&&<span className="timesheet-legend-note">Новые условия работы идут отдельной строкой с даты изменения.</span>}</div>

    <div className="timesheet-summary-strip">
      <div><span>Сотрудники</span><strong>{new Set(rows.filter(row=>row.rowKind!=="candidate").map(row=>row.workerId)).size}</strong></div>
      <div><span>Дневные</span><strong>{totals.dayShifts} смен</strong><small>{totals.dayHours} ч</small></div>
      <div><span>Ночные</span><strong>{totals.nightShifts} смен</strong><small>{totals.nightHours} ч</small></div>
      <div className={totals.noShows?"is-attention":""}><span>Прогулы</span><strong>{totals.noShows}</strong><small>{totals.noShows?"требуют проверки":"нет"}</small></div>
    </div>

    <div className="timesheet-mode-note">
      <Status tone={view==="client"?"info":"neutral"}>{view==="client"?"Для согласования":"Рабочий табель"}</Status>
      <span>{view==="client"?"Внешний вид без внутренних ставок и расчётов.":"Факт и исторические ставки видны сразу; начисления и выплаты раскрываются через «Финансы»."}</span>
      <span>Состояние: <strong>{statusLabel(data.status)}</strong></span>
      {message&&<span><strong>{message}</strong></span>}
    </div>

    <section className="section timesheet-matrix-section">
      <div className="section-head">
        <div><h2>{data.object} · {data.period}</h2><p>План по дням берётся из действующей потребности объекта. Межвахта и отпуск остаются визуальными периодами и в счётчики не входят.</p></div>
        <div className="page-actions timesheet-table-actions">
          <button type="button" className={`button timesheet-attention-toggle ${attentionOnly?"active":""}`} onClick={()=>setAttentionOnly(value=>!value)}>Требует внимания{attentionCount?` · ${attentionCount}`:""}</button>
          <button type="button" className={`button timesheet-details-toggle ${detailsOpen?"active":""}`} onClick={()=>setDetailsOpen(value=>!value)}>{detailsOpen?"Скрыть показатели":"Показатели"}</button>
          {view==="internal"&&sensitive&&<button type="button" className={`button timesheet-finance-toggle ${financeOpen?"active":""}`} onClick={()=>setFinanceOpen(value=>!value)}>{financeOpen?"Скрыть финансы":"Финансы"}</button>}
          {view==="client"&&<Status tone="info"><ShieldCheck size={12}/> без ставок</Status>}
        </div>
      </div>
      <div className="timesheet-wrap compact-timesheet" ref={tableWrapRef}>
        <table className={`data-table timesheet timesheet-two-line timesheet-operational timesheet-period-${mode}`}>
          <colgroup>
            <col className="timesheet-col-worker"/>
            <col className="timesheet-col-shift"/>
            {view==="internal"&&sensitive&&<col className="timesheet-col-rate"/>}
            {days.map(day=><col className="timesheet-col-day" key={`col-${day}`}/>)}
            <col className="timesheet-col-shifts"/><col className="timesheet-col-hours"/>
            {detailsOpen&&<><col className="timesheet-col-detail"/><col className="timesheet-col-detail"/><col className="timesheet-col-detail"/></>}
            {view==="internal"&&sensitive&&financeOpen&&<><col className="timesheet-col-finance"/><col className="timesheet-col-finance"/><col className="timesheet-col-correction"/><col className="timesheet-col-payment"/><col className="timesheet-col-payment"/></>}
          </colgroup>
          <thead><tr>
            <th className="sticky-col timesheet-worker-col">Сотрудник</th><th className="timesheet-shift-col timesheet-sticky-shift">Смена</th>
            {view==="internal"&&sensitive&&<th className="timesheet-rate-col timesheet-sticky-rate">Ставка</th>}
            {days.map(day=><th className={`day ${isWeekend(data.month,day)?"weekend":""} ${currentDay===day?"today":""}`} key={day}><span>{weekday(data.month,day)}</span>{day}</th>)}
            <th>Смен</th><th>Часов</th>
            {detailsOpen&&<><th className="timesheet-detail-col">Выходные</th><th className="timesheet-detail-col">Больничные</th><th className="timesheet-detail-col">Прогулы</th></>}
            {view==="internal"&&sensitive&&financeOpen&&<><th>Начислено</th><th>Всего</th><th>Корр.</th><th>Выплачено</th><th>К выплате</th></>}
          </tr></thead>
          <tbody>{visibleRows.flatMap(row=>{
            const segments=visibleSegments(row,rowMode,days);
            const calculatedSelected=calculateSegmentAccrued(row,"day",days,data.month)+calculateSegmentAccrued(row,"night",days,data.month);
            const earned=mode==="month"?(row.accrualTotal??row.calculatedAccrual??calculatedSelected):calculatedSelected;
            const correction=Number(row.premium??0)+Number(row.adjustment??0);
            return segments.map((segment,index)=>{
              const cells=segment==="day"?row.dayCells:row.nightCells;
              const shiftHours=days.reduce((sum,day)=>sum+numericCell(cells?.[String(day)]),0);
              const shiftCount=days.filter(day=>numericCell(cells?.[String(day)])>0).length;
              const segmentAccrued=calculateSegmentAccrued(row,segment,days,data.month);
              const first=index===0,last=index===segments.length-1;
              return <tr key={`${row.rowId??row.workerId}:${segment}`} className={[
                row.rowKind==="candidate"?"timesheet-candidate-row":"",
                first?"timesheet-worker-start":"",
                last?"timesheet-worker-end":"",
                segments.length===1?"timesheet-worker-single":"",
                segment==="night"?"timesheet-night-row":"",
              ].filter(Boolean).join(" ")}>
                {first&&<td className="cell-title sticky-col timesheet-worker-cell" rowSpan={segments.length}><EmployeeIdentity row={row}/></td>}
                <td className="timesheet-shift-col timesheet-sticky-shift"><b>{segment==="day"?"День":"Ночь"}</b></td>
                {view==="internal"&&sensitive&&<td className="timesheet-rate-col timesheet-sticky-rate"><RateHistory row={row} segment={segment} month={data.month}/></td>}
                {days.map(day=>{
                  const date=dateString(data.month,day),ended=isAfterEnd(row,date),firstEnded=isFirstAfterEnd(row,date);
                  const absence=absenceRangeAt(row,date);
                  const band=absence&&(absence.type==="intershift"||absence.type==="vacation")?absence:null;
                  const bandPosition=band?absenceBandPosition(band,day,days,data.month):null;
                  const absenceStart=Boolean(band&&date===band.from);
                  const stateCode=firstEnded?(first?"УВ":null):absenceStart?(first?absenceCode(band!):null):null;
                  const raw=cells?.[String(day)];
                  const value=ended||band?stateCode:raw;
                  const key=`${row.workerId}:${day}:${segment}`;
                  const editable=canEditFact&&row.rowKind!=="candidate"&&!ended&&!band;
                  const classes=[
                    timesheetCellClass(value,ended,isWeekend(data.month,day)),
                    currentDay===day?"today":"",
                    band?`timesheet-absence-band timesheet-absence-${band.type} range-${bandPosition}`:"",
                    (ended||band)&&!stateCode?"timesheet-blocked-continuation":"",
                  ].filter(Boolean).join(" ");
                  return <td key={day} className={classes}>
                    {editable
                      ?<input className="timesheet-cell-input" value={raw==null?"":String(raw)} disabled={saving===key} onKeyDown={handleCellKeyDown} onFocus={event=>event.currentTarget.select()} onChange={event=>setRows(current=>current.map(item=>(item.rowId??item.workerId)!==(row.rowId??row.workerId)?item:{...item,[segment==="day"?"dayCells":"nightCells"]:{...(segment==="day"?item.dayCells:item.nightCells),[String(day)]:normalizeCell(event.target.value)}}))} onBlur={event=>void persistCell(row.workerId,day,event.target.value,segment)} aria-label={`${row.name} ${segment} ${day}`}/>
                      :stateCode??""}
                  </td>;
                })}
                <td className="num">{shiftCount||"—"}</td><td className="num">{shiftHours||"—"}</td>
                {detailsOpen&&first&&<>
                  <td className="num timesheet-detail-col" rowSpan={segments.length}>{countWorkerCode(row,"В",days)||"—"}</td>
                  <td className="num timesheet-detail-col" rowSpan={segments.length}>{countWorkerCode(row,"Б",days)||"—"}</td>
                  <td className={`num timesheet-detail-col ${countWorkerNoShows(row,days)?"timesheet-detail-alert":""}`} rowSpan={segments.length}>{countWorkerNoShows(row,days)||"—"}</td>
                </>}
                {view==="internal"&&sensitive&&financeOpen&&<><td className="num timesheet-money">{row.rowKind==="candidate"?"—":money(segmentAccrued)}</td>{first&&<>
                  <td className="num timesheet-money timesheet-money-total" rowSpan={segments.length}>{row.rowKind==="candidate"?"—":money(earned)}</td>
                  <td className="num timesheet-money" rowSpan={segments.length}>{row.rowKind==="candidate"?"—":mode==="month"?signedMoney(correction):"—"}</td>
                  <td className="num timesheet-money" rowSpan={segments.length}>{row.rowKind==="candidate"?"—":mode==="month"?money(row.paidAmount??0):"—"}</td>
                  <td className="num timesheet-money timesheet-payable" rowSpan={segments.length}>{row.rowKind==="candidate"?"—":mode==="month"?money(row.payableAmount??earned):"—"}</td>
                </>}</>}
              </tr>;
            });
          })}</tbody>
          {attentionOnly&&visibleRows.filter(row=>row.rowKind!=="candidate").length===0&&<tbody><tr><td className="timesheet-filter-empty" colSpan={days.length+(view==="internal"&&sensitive?3:2)+2+(detailsOpen?3:0)+(view==="internal"&&sensitive&&financeOpen?5:0)}>Нет сотрудников, требующих внимания за выбранный период.</td></tr></tbody>}
          <tfoot className="timesheet-daily-summary">
            <tr>
              <td className="sticky-col timesheet-summary-label" colSpan={view==="internal"&&sensitive?3:2}>План, чел.</td>
              {days.map(day=><td className={`day num ${isWeekend(data.month,day)?"weekend":""} ${currentDay===day?"today":""}`} key={day}>{daySummary[day]?.planned||"—"}</td>)}
              <td className="num" title="Плановых человеко-выходов за выбранный период">{days.reduce((sum,day)=>sum+(daySummary[day]?.planned??0),0)||"—"}</td><td>—</td>
              {detailsOpen&&<td colSpan={3}></td>}
              {view==="internal"&&sensitive&&financeOpen&&<td colSpan={5}></td>}
            </tr>
            <tr>
              <td className="sticky-col timesheet-summary-label" colSpan={view==="internal"&&sensitive?3:2}>Вышло, чел.</td>
              {days.map(day=>{const summary=daySummary[day];const date=dateString(data.month,day);const deficit=date<=todayIso&&Number(summary?.planned??0)>Number(summary?.worked??0);return <td className={`day num ${isWeekend(data.month,day)?"weekend":""} ${currentDay===day?"today":""} ${deficit?"timesheet-staffing-deficit":""}`} key={day} title={deficit?`План: ${summary?.planned??0}, вышло: ${summary?.worked??0}`:undefined}>{summary?.worked||"—"}</td>})}
              <td className="num" title="Фактических человеко-выходов за выбранный период">{days.reduce((sum,day)=>sum+(daySummary[day]?.worked??0),0)||"—"}</td><td>—</td>
              {detailsOpen&&<td colSpan={3}></td>}
              {view==="internal"&&sensitive&&financeOpen&&<td colSpan={5}></td>}
            </tr>
            <tr className="timesheet-summary-hours">
              <td className="sticky-col timesheet-summary-label" colSpan={view==="internal"&&sensitive?3:2}>Отработано, ч.</td>
              {days.map(day=><td className={`day num ${isWeekend(data.month,day)?"weekend":""} ${currentDay===day?"today":""}`} key={day}>{daySummary[day]?.hours||"—"}</td>)}
              <td className="num">{totals.dayShifts+totals.nightShifts}</td><td className="num">{totalHours}</td>
              {detailsOpen&&<><td className="num">{detailTotals.daysOff||"—"}</td><td className="num">{detailTotals.sick||"—"}</td><td className="num">{detailTotals.noShows||"—"}</td></>}
              {view==="internal"&&sensitive&&financeOpen&&<><td className="num timesheet-money">{money(rows.reduce((sum,row)=>sum+calculateSegmentAccrued(row,"day",days,data.month)+calculateSegmentAccrued(row,"night",days,data.month),0))}</td><td colSpan={4}></td></>}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section className="section">
      <div className="section-head"><div><h2>Маршрут табеля</h2><p>Отправленная версия не перезаписывается.</p></div><Status tone="neutral">{statusLabel(data.status)}</Status></div>
      <div className="timesheet-workflow-panel">
        <input value={comment} onChange={event=>setComment(event.target.value)} placeholder="Комментарий к передаче или возврату"/>
        <div className="page-actions">
          {canSubmit&&(!internal||["draft","returned"].includes(internal.status))&&<button className="button primary" disabled={busy} onClick={()=>void workflow("submit_internal")}><Send size={14}/> На проверку</button>}
          {canReview&&internal?.status==="internal_submitted"&&<><button className="button primary" disabled={busy} onClick={()=>void workflow("review_internal")}><CheckCircle2 size={14}/> Проверено</button><button className="button" disabled={busy} onClick={()=>void workflow("return_internal")}><RotateCcw size={14}/> Вернуть</button></>}
          {canSubmit&&internal?.status==="internal_checked"&&(!client||client.status==="returned")&&<button className="button primary" disabled={busy} onClick={()=>void workflow("send_client")}><Send size={14}/> Отправить клиенту</button>}
          {canApproveClient&&client?.status==="client_sent"&&<><button className="button primary" disabled={busy} onClick={()=>void workflow("client_approve")}><CheckCircle2 size={14}/> Клиент согласовал</button><button className="button" disabled={busy} onClick={()=>void workflow("client_return")}><RotateCcw size={14}/> Вернул</button></>}
          {canClose&&client?.status==="client_approved"&&<button className="button primary" disabled={busy} onClick={()=>void workflow("close")}><WalletCards size={14}/> Закрыть период</button>}
        </div>
      </div>
    </section>
  </div>;
}

function EmployeeIdentity({row}:{row:TimesheetWorkerRow}){
  const history=(row.specialtyHistory??[]).slice().sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
  const current=history.at(-1);
  return <div className="timesheet-worker-identity">
    <strong>{row.name}</strong>
    <span>{current?.specialty??row.specialty??(row.rowKind==="candidate"?"Кандидат":"Без специальности")}</span>
    {row.conditionSegment&&row.effectiveFrom&&<small>Условия {shortDate(row.effectiveFrom)}–{row.effectiveTo?shortDate(row.effectiveTo):"далее"}</small>}
    {row.rowKind==="candidate"&&<small>Кандидат · план первого выхода</small>}
  </div>;
}
function RateHistory({row,segment,month}:{row:TimesheetWorkerRow;segment:Segment;month:string}){
  if(row.rowKind==="candidate")return <>—</>;
  const rates=relevantRates(row,segment,month);
  if(!rates.length){
    const fallback=segment==="day"?row.dayRate??row.rate:row.nightRate??row.rate;
    return <span>{fallback==null?"—":rateText(fallback)}</span>;
  }
  return <div className="timesheet-rate-history">{rates.map((rate,index)=>{
    const last=index===rates.length-1;
    return <span key={rate.kind+rate.effectiveFrom} className={last?"current":"previous"}><b>{formatRate(rate,row.plannedHours)}</b><small>{ratePeriodLabel(rate,month)}</small></span>;
  })}</div>;
}
function rowCoversDate(row:TimesheetWorkerRow,date:string){return (!row.effectiveFrom||date>=row.effectiveFrom)&&(!row.effectiveTo||date<=row.effectiveTo)}
function rowNeedsAttention(row:TimesheetWorkerRow,days:number[],month:string,todayIso:string){
  return days.some(day=>{
    const date=dateString(month,day);if(date>todayIso)return false;
    const dayValue=String(row.dayCells?.[String(day)]??""),nightValue=String(row.nightCells?.[String(day)]??"");
    return [dayValue,nightValue].some(value=>["?","НВ","Н","Б","П"].includes(value));
  });
}
function visibleSegments(row:TimesheetWorkerRow,mode:RowMode,days:number[]):Segment[]{
  if(mode==="all")return["day","night"];
  if(mode==="day"||mode==="night")return[mode];
  const active=(segment:Segment)=>{
    const cells=segment==="day"?row.dayCells:row.nightCells;
    return days.some(day=>{
      const value=cells?.[String(day)];
      if(numericCell(value)>0||value==="П"||value==="?"||value==="НВ"||value==="Н")return true;
      const planned=row.plannedShiftKinds?.[String(day)];
      return planned===segment||planned==="mixed";
    });
  };
  const day=active("day"),night=active("night");
  if(day&&night)return["day","night"];
  if(night)return["night"];
  if(day)return["day"];
  const monthKinds=Object.values(row.plannedShiftKinds??{});
  const monthHasDay=monthKinds.some(kind=>kind==="day"||kind==="mixed");
  const monthHasNight=monthKinds.some(kind=>kind==="night"||kind==="mixed");
  if(monthHasNight&&!monthHasDay)return["night"];
  if(monthHasDay&&monthHasNight)return["day","night"];
  return["day"];
}
function absenceRangeAt(row:TimesheetWorkerRow,date:string){return(row.absenceRanges??[]).find(item=>item.from<=date&&(!item.to||item.to>=date))??null}
function absenceBandPosition(range:TimesheetAbsenceRange,day:number,days:number[],month:string){
  const covered=days.filter(item=>{const date=dateString(month,item);return range.from<=date&&(!range.to||range.to>=date)});
  if(!covered.length)return null;
  if(covered.length===1&&covered[0]===day)return"single";
  if(covered[0]===day)return"start";
  if(covered.at(-1)===day)return"end";
  return"middle";
}
function absenceCode(range:TimesheetAbsenceRange){return range.type==="intershift"?"МВ":"О"}
function countWorkerCode(row:TimesheetWorkerRow,code:string,days:number[]){return days.filter(day=>row.dayCells?.[String(day)]===code||row.nightCells?.[String(day)]===code).length}
function countWorkerNoShows(row:TimesheetWorkerRow,days:number[]){return days.filter(day=>["НВ","Н"].includes(String(row.dayCells?.[String(day)]??""))||["НВ","Н"].includes(String(row.nightCells?.[String(day)]??""))).length}
function calculateSegmentAccrued(row:TimesheetWorkerRow,segment:Segment,days:number[],month:string){
  if(row.rowKind==="candidate")return 0;
  let total=0;
  for(const day of days){
    const hours=numericCell((segment==="day"?row.dayCells:row.nightCells)?.[String(day)]);if(hours<=0)continue;
    const rate=rateAt(row,dateString(month,day),segment);if(!rate)continue;
    if(rate.unit==="hour")total+=hours*Number(rate.amount);
    else if(rate.unit==="shift"){const planned=Number(row.plannedHours??0);total+=planned>0?hours*(Number(rate.amount)/planned):Number(rate.amount)}
  }
  if(segment==="day"){
    const dates=days.filter(day=>numericCell(row.dayCells?.[String(day)])>0||numericCell(row.nightCells?.[String(day)])>0).map(day=>dateString(month,day));
    const monthly=(row.rateHistory??[]).filter(rate=>rate.kind==="any"&&rate.unit==="month"&&dates.some(date=>rate.effectiveFrom<=date&&(!rate.effectiveTo||rate.effectiveTo>=date))).reduce((max,rate)=>Math.max(max,Number(rate.amount)),0);
    total+=monthly;
  }
  return total;
}
function rateAt(row:TimesheetWorkerRow,date:string,segment:Segment){
  const active=(row.rateHistory??[]).filter(rate=>rate.effectiveFrom<=date&&(!rate.effectiveTo||rate.effectiveTo>=date));
  return active.filter(rate=>rate.kind===segment).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]??active.filter(rate=>rate.kind==="any").sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]??null;
}
function relevantRates(row:TimesheetWorkerRow,segment:Segment,month:string){
  const start=month+"-01",end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  const all=(row.rateHistory??[]).filter(rate=>(rate.kind===segment||rate.kind==="any")&&rate.effectiveFrom<=end&&(!rate.effectiveTo||rate.effectiveTo>=start)).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
  const effective:TimesheetRatePeriod[]=[];
  for(const rate of all){if(!effective.some(item=>item.kind===rate.kind&&item.effectiveFrom===rate.effectiveFrom&&Number(item.amount)===Number(rate.amount)))effective.push(rate)}
  return effective;
}
function formatRate(rate:TimesheetRatePeriod,plannedHours:number|null|undefined){
  if(rate.unit==="shift"){const hours=Number(plannedHours??0);return hours>0?`${rub(Number(rate.amount)/hours)}/ч`:`${rub(rate.amount)}/смена`}
  return rate.unit==="month"?`${rub(rate.amount)}/мес`:`${rub(rate.amount)}/ч`;
}
function ratePeriodLabel(rate:TimesheetRatePeriod,month:string){
  const start=rate.effectiveFrom>month+"-01"?`с ${shortDate(rate.effectiveFrom)}`:"";
  const end=rate.effectiveTo&&rate.effectiveTo.slice(0,7)===month?`до ${shortDate(rate.effectiveTo)}`:"";
  return [start,end].filter(Boolean).join(" · ");
}
function rateTextForExport(row:TimesheetWorkerRow,segment:Segment,month:string){return relevantRates(row,segment,month).map(rate=>`${formatRate(rate,row.plannedHours)} ${ratePeriodLabel(rate,month)}`.trim()).join(" / ")||rateText(segment==="day"?row.dayRate??row.rate:row.nightRate??row.rate)}
function specialtyText(row:TimesheetWorkerRow){return (row.specialtyHistory??[]).map(item=>`${item.specialty??"Без специальности"}${item.effectiveTo?` до ${shortDate(item.effectiveTo)}`:""}`).join(" / ")||row.specialty||""}
function cellDisplay(row:TimesheetWorkerRow,day:number,segment:Segment,month:string){
  const date=dateString(month,day);
  if(isFirstAfterEnd(row,date))return"УВ";
  if(isAfterEnd(row,date))return"";
  const absence=absenceRangeAt(row,date);
  if(absence&&(absence.type==="intershift"||absence.type==="vacation"))return date===absence.from?absenceCode(absence):"";
  return (segment==="day"?row.dayCells:row.nightCells)?.[String(day)]??"";
}
function timesheetCellClass(value:TimesheetCellValue|undefined,ended:boolean,weekend:boolean){
  const code=String(value??"");const classes=["day"];if(weekend)classes.push("weekend");if(ended)classes.push("timesheet-terminated");
  if(code==="П")classes.push("day-planned");if(code==="В")classes.push("timesheet-day-off");if(code==="МВ")classes.push("timesheet-intershift");if(code==="О")classes.push("timesheet-vacation");if(code==="Б")classes.push("timesheet-sick");if(code==="НВ")classes.push("timesheet-no-show");if(code==="УВ")classes.push("timesheet-ended-marker");
  return classes.join(" ");
}
function range(start:number,end:number){return Array.from({length:end-start+1},(_,index)=>start+index)}
function dateFor(month:string,day:number){const[year,number]=month.split("-").map(Number);return new Date(Date.UTC(year,number-1,day))}
function dateString(month:string,day:number){return `${month}-${String(day).padStart(2,"0")}`}
function isWeekend(month:string,day:number){const value=dateFor(month,day).getUTCDay();return value===0||value===6}
function weekday(month:string,day:number){return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(dateFor(month,day)).replace(".","")}
function numericCell(value:unknown){return typeof value==="number"?value:typeof value==="string"&&/^\d+(?:[.,]\d+)?$/.test(value)?Number(value.replace(",",".")):0}
function normalizeCell(value:string):TimesheetCellValue{const normalized=value.trim().toUpperCase();if(normalized==="")return null;if(/^\d+(?:[.,]\d+)?$/.test(normalized))return Number(normalized.replace(",","."));return normalized}
function statusLabel(value:string){const labels:Record<string,string>={draft:"Черновик",submitted:"Передан",approved:"Согласован",returned:"Возвращён",internal_submitted:"На внутренней проверке",internal_checked:"Проверен внутри",client_sent:"Отправлен клиенту",client_approved:"Подтверждён клиентом",closed:"Закрыт"};return labels[value]??value}
function isAfterEnd(row:TimesheetWorkerRow,date:string){return Boolean(row.effectiveTo&&date>row.effectiveTo)}
function isFirstAfterEnd(row:TimesheetWorkerRow,date:string){if(!row.effectiveTo)return false;const day=new Date(row.effectiveTo+"T00:00:00Z");day.setUTCDate(day.getUTCDate()+1);return date===day.toISOString().slice(0,10)}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function money(value:number|string){return rub(Math.round(Number(value)||0))}
function signedMoney(value:number){if(!value)return"—";return `${value>0?"+":""}${money(value)}`}
function rateText(value:number|string|null|undefined){return value==null?"—":`${rub(value)}/ч`}
