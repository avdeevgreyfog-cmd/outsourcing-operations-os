"use client";

import {useEffect,useRef} from "react";
import type {EmploymentRelationChoice} from "@/lib/recruiting/workflow";
export type EmploymentRelationTypeChoice=EmploymentRelationChoice;

export function FirstShiftConfirmationFields({
  actualStartAt,
  employmentRelationType,
  onActualStartAtChange,
  onEmploymentRelationTypeChange,
}: {
  actualStartAt:string;
  employmentRelationType:EmploymentRelationTypeChoice|"";
  onActualStartAtChange:(value:string)=>void;
  onEmploymentRelationTypeChange:(value:EmploymentRelationTypeChoice|"")=>void;
}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const target=root.current?.closest(".object-candidate-card,.staffing-funnel-card")??root.current;
    target?.scrollIntoView({block:"nearest",inline:"nearest"});
  },[]);
  return <div ref={root} className="first-shift-confirmation-fields wide" style={{display:"grid",gap:8,minWidth:0}}>
    <label style={{display:"grid",gap:4}}>
      Фактическая дата и время выхода
      <input type="datetime-local" value={actualStartAt} onChange={event=>onActualStartAtChange(event.target.value)} required/>
    </label>
    <label style={{display:"grid",gap:4}}>
      Формат оформления
      <select value={employmentRelationType} onChange={event=>onEmploymentRelationTypeChange(event.target.value as EmploymentRelationTypeChoice|"")} required>
        <option value="">Выберите формат оформления</option>
        <option value="unspecified">Пока не указано</option>
        <option value="employment">Трудовой договор</option>
        <option value="gph">ГПХ</option>
        <option value="npd">Самозанятый</option>
        <option value="custom">Другое</option>
      </select>
    </label>
    <small>Формат не подтверждает подписание договора. Если данных пока нет, выберите «Пока не указано».</small>
  </div>;
}
