"use client";
import { useState } from "react";
import { Status } from "@/components/UI";

type Candidate = { id:string; fullName:string; phone?:string; source?:string; stage:string; stageLabel?:string; need?:string; object?:string; nextAction?:string };
const columns = [["new","Новые"],["call","Созвон"],["documents","Документы"],["first_shift","Первый выход"]] as const;
export function CandidateBoard({ rows }: { rows: Candidate[] }) {
  const [selected,setSelected]=useState<Candidate|null>(null);
  return <><div className="kanban">{columns.map(([stage,label])=>{const items=rows.filter(x=>x.stage===stage);return <div className="kanban-col" key={stage}><div className="kanban-head"><span>{label}</span><span className="kanban-count">{items.length}</span></div>{items.map(x=><button className="kanban-card" key={x.id} onClick={()=>setSelected(x)}><strong>{x.fullName}</strong><span>{x.need} · {x.object}</span><span>Следующее: {x.nextAction}</span></button>)}</div>})}</div>{selected&&<><div className="drawer-backdrop" onClick={()=>setSelected(null)}/><aside className="drawer"><button className="icon-button drawer-close" onClick={()=>setSelected(null)}>×</button><span className="eyebrow">Candidate application</span><h2>{selected.fullName}</h2><Status tone="info">{selected.stageLabel??selected.stage}</Status><dl><dt>Телефон</dt><dd>{selected.phone??"—"}</dd><dt>Источник</dt><dd>{selected.source??"—"}</dd><dt>Потребность</dt><dd>{selected.need??"—"}</dd><dt>Объект</dt><dd>{selected.object??"—"}</dd><dt>Следующее действие</dt><dd>{selected.nextAction??"—"}</dd></dl><div className="section" style={{marginTop:20,padding:14}}><strong style={{fontSize:11}}>Attribution сохраняется</strong><p style={{fontSize:10,color:"var(--muted)",lineHeight:1.5}}>Person-level Candidate остаётся единым, а CandidateApplication хранит контекст конкретной потребности/объекта и историю ответственного.</p></div></aside></>}</>;
}
