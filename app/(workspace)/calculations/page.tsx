import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listCommercialCalculations } from "@/lib/commercial/calculation-list";
import { getCalculationModels } from "@/lib/commercial/calculation-models";
import { getCommercialRequest } from "@/lib/commercial/service";
import { getTender } from "@/lib/tenders/service";
import { PageHeader, Section, Status } from "@/components/UI";
import { CalculatorWorkspace } from "@/components/CalculatorWorkspace";
import { SubmitApprovalButton } from "@/components/CommercialWorkflowActions";
import { rub, pct } from "@/lib/ui/format";

function tone(status:string){if(status==="accepted")return "good" as const;if(status==="rejected")return "bad" as const;if(status==="superseded")return "neutral" as const;return "warn" as const;}
const statusLabels:Record<string,string>={draft:"Черновик",pending:"На согласовании",review:"На согласовании",accepted:"Принято",rejected:"Отклонено",superseded:"Заменено новой версией",approved:"Согласовано"};
function statusLabel(value:string){return statusLabels[value]??(/[A-Za-z_]/.test(value)?"Другой статус":value);}
const billingLabels:Record<string,string>={hour:"час",shift:"смена",unit:"единица",worker_month:"сотрудник / месяц",project_month:"проект / месяц",project_fixed:"фиксированная сумма за проект",mixed:"смешанная"};

export default async function Calculations({searchParams}:{searchParams:Promise<{request?:string;tender?:string}>}){
  const actor=await requireActor();const query=await searchParams;
  if(actor.demo&&query.tender&&!actor.access.capabilities.includes("sales.tender.read"))actor.access.capabilities.push("sales.tender.read");
  const rows=await listCommercialCalculations(actor);
  const request=query.request?await getCommercialRequest(actor,query.request):null;
  const tender=!request&&query.tender?await getTender(actor,query.tender):null;
  const source=request??tender;const models=source?await getCalculationModels(actor):[];
  const filtered=request?rows.filter(item=>item.requestId===request.id):tender?rows.filter(item=>item.tenderId===tender.id):rows;
  const sourceKind=request?"заявка":tender?"тендер":null;
  const sourceTitle=request?.title??tender?.title??null;
  const backHref=request?`/requests/${request.id}`:tender?`/tenders/${tender.id}?tab=calculations`:null;
  const vatMode=request?.vatMode??(typeof tender?.conditions?.vatMode==="string"?tender.conditions.vatMode:null);
  const schedule=request?.schedule??{};
  const roles=request?request.roles.map(role=>({id:role.id,specialty:role.specialty,count:role.count,schedule:role.schedule,targetClientRate:role.targetClientRate})):
    tender?tender.roles.map(role=>({id:role.id,specialty:role.title,count:role.count??1,schedule:role.schedule,targetClientRate:role.targetClientRate})):[];

  return <>
    <PageHeader eyebrow="Коммерция → Экономика" title={sourceTitle?`Расчёт · ${sourceTitle}`:"Расчёты"}
      subtitle={sourceKind?`Общий калькулятор OPERIS открыт из ${sourceKind}. Сценарий сохраняется прямо в исходной сущности, без промежуточного преобразования.`:"Сценарии из заявок и тендеров используют единый расчётный движок и версии правил."}
      actions={backHref?<Link className="button" href={backHref}>Вернуться к {request?"заявке":"тендеру"}</Link>:undefined}/>
    <Section title={source?`Сценарии · ${sourceTitle}`:"Сохранённые сценарии"}>
      <div className="grid-scroll"><table className="data-table"><thead><tr><th>Источник / позиция</th><th>Модель</th><th>Сотруднику</th><th>Себестоимость / ч</th><th>Клиентская ставка</th><th>Маржа</th><th>Статус</th><th></th></tr></thead><tbody>{filtered.length?filtered.map(x=><tr key={x.id} id={`scenario-${x.id}`} className="calculation-scenario-row">
        <td><strong className="cell-title">{x.source} · {x.role}</strong><span className="cell-sub">{x.sourceType==="tender"?"Тендер":"Заявка"} · {x.name} · {billingLabels[x.billingUnit]??"другая схема"}</span></td>
        <td>{x.model}<span className="cell-sub">{x.ruleVersion?`Правила №${x.ruleVersion}`:"Без версии правил"}</span></td><td className="num">{rub(x.workerNet)}</td><td className="num">{rub(x.totalCost)}</td><td className="num">{rub(x.clientRate)}<span className="cell-sub">без НДС</span></td><td className="num">{pct(x.marginPct)}</td><td><Status tone={tone(x.status)}>{statusLabel(x.status)}</Status></td><td>{hasCapability(actor.access,"calculation.scenario.edit")&&["draft","rejected"].includes(x.status)&&<SubmitApprovalButton subjectType="calculation_scenario" subjectId={x.id}/>}</td>
      </tr>):<tr><td colSpan={8}><div className="commercial-empty">Сохранённых сценариев пока нет</div></td></tr>}</tbody></table></div>
    </Section>

    {source&&hasCapability(actor.access,"calculation.scenario.create")&&roles.length>0&&<><div style={{height:16}}/><PageHeader eyebrow="Новый сценарий" title="Новый расчёт" subtitle={`${request?"Заявка":"Тендер"}: ${sourceTitle}. Позиции и исходные значения подставляются из источника; экономика сохраняется отдельной версией.`}/><CalculatorWorkspace context={{sourceType:request?"request":"tender",sourceId:source.id,sourceLabel:sourceTitle??undefined,roles,models,vatMode,schedule}}/></>}
    {tender&&roles.length===0&&<Section title="Сначала добавьте позиции"><p className="muted">Чтобы сохранить расчёт по тендеру, укажите хотя бы одну специальность или работу во вкладке «Анализ».</p></Section>}

    {!source&&<><div style={{height:16}}/><PageHeader eyebrow="Режим моделирования" title="Быстрый расчёт" subtitle="Независимое моделирование без заявки или тендера. Если расчёт должен войти в коммерческий процесс, откройте калькулятор из соответствующей сущности."/><CalculatorWorkspace/></>}
  </>;
}
