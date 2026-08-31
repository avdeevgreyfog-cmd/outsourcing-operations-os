import Link from "next/link";
import {requireActor} from "@/lib/auth/server";
import {getCalculatorModelRules,listCommercialCalculations,listCommercialRequests,listRequestProvisions} from "@/lib/data/commercial-service";
import {PageHeader,Section,Status} from "@/components/UI";
import {CommercialCalculatorWorkspace} from "@/components/CommercialCalculatorWorkspace";
import {calculationViewLabels} from "@/lib/commercial/constants";
import {pct,rub} from "@/lib/ui/format";

export default async function Calculations({searchParams}:{searchParams:Promise<{view?:string;request?:string}>}){
 const {view:rawView,request:requestId}=await searchParams;const view=rawView==="request"||rawView==="standalone"?rawView:"all";const actor=await requireActor();const [rows,rules,requests]=await Promise.all([listCommercialCalculations(actor),getCalculatorModelRules(actor),listCommercialRequests(actor)]);const request=requestId?requests.find(row=>row.id===requestId)??null:null;const provisions=request?await listRequestProvisions(actor,request.id):[];
 const filtered=view==="request"?rows.filter(row=>row.sourceKind==="request"):view==="standalone"?rows.filter(row=>row.sourceKind==="standalone"):rows;
 const actions=<div className="segmented">{Object.entries(calculationViewLabels).map(([key,label])=><Link key={key} className={view===key?"active":""} href={`/calculations?view=${key}`}>{label}</Link>)}</div>;
 return <><PageHeader eyebrow="Коммерция → Экономика" title="Расчёты" subtitle="Один модуль для расчётов из заявки и самостоятельных сценариев. Каждая сохранённая версия фиксирует исходные правила и расходы." breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"Расчёты"}]} actions={actions}/>
 {request&&<div className="summary-strip"><span><strong>{request.number}</strong> · {request.title}</span><span>{request.roles.map(role=>`${role.name} × ${role.count}`).join(" · ")}</span><Link className="button" href={`/requests/${request.id}?tab=calculations`}>Вернуться в заявку</Link></div>}
 <Section title={view==="standalone"?"Самостоятельные расчёты":view==="request"?"Сценарии по заявкам":"Все сценарии"}><table className="data-table"><thead><tr><th>Контекст / сценарий</th><th>Позиция</th><th>Модель</th><th>Сотруднику</th><th>Себестоимость</th><th>Клиент без НДС</th><th>Клиент с НДС</th><th>Маржа</th><th>Согласование</th><th>Статус</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td><strong className="cell-title">{row.sourceKind==="standalone"?row.calculationTitle:row.request}</strong><span className="cell-sub">v{row.scenarioNumber} · {row.name}</span></td><td>{row.role}</td><td>{row.model}</td><td className="num">{rub(row.workerNet)}</td><td className="num">{rub(row.totalCost)}</td><td className="num">{rub(row.clientRate)}</td><td className="num">{row.clientRateWithVat!=null?rub(row.clientRateWithVat):"—"}</td><td className="num">{pct(row.marginPct)}</td><td>{row.approvalStatus??"—"}</td><td><Status tone={row.status==="accepted"?"good":row.status==="rejected"?"bad":"warn"}>{row.status}</Status></td></tr>)}</tbody></table></Section>
 <div style={{height:16}}/><PageHeader eyebrow={request?`Новый сценарий · ${request.number}`:"Новый сценарий"} title={request?"Расчёт из заявки":"Самостоятельный расчёт"} subtitle={request?"Позиции, численность, коммерческий лимит и расходы заявки уже переданы в калькулятор.":"Расчёт можно сохранить без заявки и позднее связать с существующей или новой заявкой."}/><CommercialCalculatorWorkspace rules={rules} request={request} provisions={provisions} demo={actor.demo}/>
 </>;
}
