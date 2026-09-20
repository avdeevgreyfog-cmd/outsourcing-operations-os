import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { PageHeader, Metric, Section, Status } from "@/components/UI";
import { listStaffingForecast } from "@/lib/operations/service";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export default async function StaffingPlanPage({searchParams}:{searchParams:Promise<{horizon?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const horizon=Math.max(7,Math.min(90,Number(params.horizon??30)||30));
  const rows=await listStaffingForecast(actor,horizon);
  const required=rows.reduce((sum,row)=>sum+row.required,0);
  const working=rows.reduce((sum,row)=>sum+row.working,0);
  const incoming=rows.reduce((sum,row)=>sum+row.preparing,0);
  const projectedDeficit=rows.reduce((sum,row)=>sum+row.projectedDeficit,0);
  return <>
    <PageHeader eyebrow="Операции → Управление объектами" title="Комплектация" subtitle={"Прогноз обеспеченности персоналом на "+horizon+" дней с учётом подбора, межвахты, отсутствий и запланированных завершений работы."} breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"Комплектация"}]}/>
    <div className="scheduler-controls">
      <div className="segmented">
        {[14,30,60,90].map(value=><Link key={value} className={horizon===value?"active":""} href={"/staffing-plan?horizon="+value}>{value} дней</Link>)}
      </div>
    </div>
    <div className="metrics-grid">
      <Metric label="Потребность" value={required}/>
      <Metric label="Работает сейчас" value={working}/>
      <Metric label="Готовятся к выходу" value={incoming}/>
      <Metric label="Прогнозный дефицит" value={projectedDeficit} tone={projectedDeficit?"warn":"good"}/>
    </div>
    <Section title="Прогноз по объектам и профессиям" note="Предварительные отсутствия показаны как риск отдельно и не уменьшают прогноз до подтверждения.">
      <div className="grid-scroll"><table className="data-table">
        <thead><tr><th>Объект / профессия</th><th>Нужно</th><th>Работает</th><th>Готовятся</th><th>Подтв. отсутствия</th><th>Риск отсутствий</th><th>Плановые выходы</th><th>Прогноз доступно</th><th>Дефицит</th><th>Действие</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.objectId+":"+row.specialtyId}>
          <td><Link className="cell-title" href={"/objects/"+row.objectId}>{row.object}</Link><span className="cell-sub">{row.specialty}</span></td>
          <td className="num">{row.required}</td><td className="num">{row.working}</td><td className="num">{row.preparing}</td>
          <td className="num">{row.confirmedAbsences||"—"}</td><td className="num">{row.tentativeAbsences||"—"}</td><td className="num">{row.plannedExits||"—"}</td>
          <td className="num">{row.projectedAvailable}</td>
          <td className="num"><Status tone={row.projectedDeficit?"warn":"good"}>{row.projectedDeficit}</Status></td>
          <td>{row.projectedDeficit?<Link className="button" href={"/needs?object="+row.objectId}>Потребности</Link>:<span className="cell-sub">Покрыто</span>}</td>
        </tr>)}</tbody>
      </table>{!rows.length&&<div className="empty-inline">Нет активных потребностей для прогноза комплектации</div>}</div>
    </Section>
  </>;
}
