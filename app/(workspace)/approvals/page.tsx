import Link from "next/link";
import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {listApprovals} from "@/lib/commercial/service";
import {listCommercialCalculations} from "@/lib/commercial/calculation-list";
import {ApprovalDecisionButtons} from "@/components/CommercialWorkflowActions";
import {Empty,PageHeader,Section,Status,SummaryStrip} from "@/components/UI";
import {pct,rub} from "@/lib/ui/format";

const warningLabels:Record<string,string>={below_minimum_margin:"маржа ниже минимума",above_client_limit:"ставка выше лимита",rules_unverified:"правила требуют проверки",rule_version_missing:"нет версии правил"};

export default async function ApprovalsPage(){
  const actor=await requireActor();
  const [rows,calculations]=await Promise.all([
    listApprovals(actor),
    hasCapability(actor.access,"calculation.scenario.read")?listCommercialCalculations(actor):Promise.resolve([]),
  ]);
  const calculationMap=new Map(calculations.map(item=>[item.id,item]));
  const pending=rows.filter(item=>item.status==="pending");
  const mayDecide=hasCapability(actor.access,"approval.decide");const allOrg=actor.access.allOrg||actor.access.scopes["approval.decide"]?.some(scope=>scope.type==="all_org");
  return <>
    <PageHeader eyebrow="Команда" title="Согласования" subtitle="Единая очередь решений по расчётам и коммерческим предложениям. Для расчёта согласующий видит ключевую экономику, а решение фиксируется в истории." breadcrumbs={[{label:"Главная"},{label:"Команда"},{label:"Согласования"}]}/>
    <SummaryStrip><span>Ожидают решения <strong>{pending.length}</strong></span><span>Всего в выборке <strong>{rows.length}</strong></span></SummaryStrip>
    <Section title="Очередь согласований">{rows.length?<div className="grid-scroll"><table className="data-table"><thead><tr><th>Предмет</th><th>Экономика / контекст</th><th>Инициатор</th><th>Согласующий</th><th>Отправлено</th><th>Статус</th><th>Решение</th></tr></thead><tbody>{rows.map(item=>{const calc=item.subjectType==="calculation_scenario"?calculationMap.get(item.subjectId):undefined;return <tr key={item.id}><td>{item.subjectType==="proposal"?<Link className="cell-title" href={`/proposals/${item.subjectId}`}>{item.subject}</Link>:<Link className="cell-title" href={item.requestId?`/calculations?request=${item.requestId}`:"/calculations"}>{item.subject}</Link>}</td><td>{calc?<><strong className="cell-title">{rub(calc.clientRate)} без НДС · маржа {pct(calc.marginPct)}</strong><span className="cell-sub">Себестоимость {rub(calc.totalCost)}/ч · прибыль {rub(calc.monthlyContribution)}/мес</span>{calc.warnings.length>0&&<span className="cell-sub">Проверить: {calc.warnings.map(code=>warningLabels[code]??code).join(" · ")}</span>}</>:item.subjectType==="proposal"?<span className="cell-sub">Клиентская версия КП доступна по ссылке</span>:"—"}</td><td>{item.requestedBy}</td><td>{item.approver??"Не определён"}</td><td>{item.requestedAt}</td><td><Status tone={item.status==="approved"?"good":item.status==="rejected"?"bad":"warn"}>{item.status}</Status>{item.decisionComment&&<span className="cell-sub">{item.decisionComment}</span>}</td><td>{item.status==="pending"&&mayDecide&&(allOrg||item.approverUserId===actor.userId)?<ApprovalDecisionButtons approvalId={item.id}/>:"—"}</td></tr>})}</tbody></table></div>:<Empty title="Очередь пуста" text="Новые расчёты и КП появятся здесь после отправки на согласование."/>}</Section>
  </>;
}
