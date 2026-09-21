import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { PageHeader, Metric, Section, Status } from "@/components/UI";
import { listStaffingForecast } from "@/lib/operations/service";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export default async function StaffingPlanPage({searchParams}:{searchParams:Promise<{horizon?:string;object?:string;view?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const horizon=Math.max(7,Math.min(90,Number(params.horizon??30)||30));
  const rows=await listStaffingForecast(actor,horizon);
  const objectIds=[...new Set(rows.map(row=>row.objectId))];
  const selectedObjectId=params.object&&objectIds.includes(params.object)?params.object:objectIds[0];
  const view=["objects","specialties","forecast","needs"].includes(params.view??"")?params.view!:"objects";
  const selectedRows=rows.filter(row=>row.objectId===selectedObjectId);
  const selectedName=selectedRows[0]?.object??"Объект";

  const totalRequired=rows.reduce((sum,row)=>sum+row.required,0);
  const totalWorking=rows.reduce((sum,row)=>sum+row.working,0);
  const totalIncoming=rows.reduce((sum,row)=>sum+row.preparing,0);
  const totalProjected=rows.reduce((sum,row)=>sum+row.projectedAvailable,0);
  const totalDeficit=rows.reduce((sum,row)=>sum+row.projectedDeficit,0);

  const selectedRequired=selectedRows.reduce((sum,row)=>sum+row.required,0);
  const selectedWorking=selectedRows.reduce((sum,row)=>sum+row.working,0);
  const selectedIncoming=selectedRows.reduce((sum,row)=>sum+row.preparing,0);
  const selectedProjected=selectedRows.reduce((sum,row)=>sum+row.projectedAvailable,0);
  const selectedDeficit=selectedRows.reduce((sum,row)=>sum+row.projectedDeficit,0);
  const selectedConfirmedAbsences=selectedRows.reduce((sum,row)=>sum+row.confirmedAbsences,0);
  const selectedTentative=selectedRows.reduce((sum,row)=>sum+row.tentativeAbsences,0);
  const selectedExits=selectedRows.reduce((sum,row)=>sum+row.plannedExits,0);

  const specialties=[...new Set(rows.map(row=>row.specialty))].map(specialty=>{
    const scope=rows.filter(row=>row.specialty===specialty);
    return {
      specialty,
      required:scope.reduce((sum,row)=>sum+row.required,0),
      working:scope.reduce((sum,row)=>sum+row.working,0),
      preparing:scope.reduce((sum,row)=>sum+row.preparing,0),
      projected:scope.reduce((sum,row)=>sum+row.projectedAvailable,0),
      deficit:scope.reduce((sum,row)=>sum+row.projectedDeficit,0),
      objects:scope.length,
    };
  }).sort((a,b)=>b.deficit-a.deficit);

  const tabs=[
    {key:"objects",label:"По объектам"},
    {key:"specialties",label:"По профессиям"},
    {key:"forecast",label:"Прогноз"},
    {key:"needs",label:"Потребности"},
  ];

  return <>
    <PageHeader eyebrow="Операции → Управление объектами" title="План комплектации" subtitle={"План численности и прогноз обеспеченности персоналом на "+horizon+" дней: работающие сотрудники, подтверждённые выходы, межвахта и плановые завершения работы."} breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"План комплектации"}]}/>

    <div className="scheduler-controls staffing-plan-controls">
      <div className="segmented">{tabs.map(item=><Link key={item.key} className={view===item.key?"active":""} href={"/staffing-plan?view="+item.key+"&horizon="+horizon+(selectedObjectId?"&object="+selectedObjectId:"")}>{item.label}</Link>)}</div>
      <div className="page-actions"><span className="cell-sub">Горизонт</span><div className="segmented">{[14,30,60,90].map(value=><Link key={value} className={horizon===value?"active":""} href={"/staffing-plan?view="+view+"&horizon="+value+(selectedObjectId?"&object="+selectedObjectId:"")}>{value} дней</Link>)}</div></div>
    </div>

    <div className="metrics-grid">
      <Metric label="Плановая численность" value={totalRequired}/>
      <Metric label="Работает сейчас" value={totalWorking}/>
      <Metric label="Подтверждено к выходу" value={totalIncoming}/>
      <Metric label="Прогнозный дефицит" value={totalDeficit} tone={totalDeficit?"warn":"good"}/>
    </div>

    {view==="objects"&&<>
      <Section title="Объекты" note="Выберите объект для детализации плана по профессиям.">
        <div className="request-table-wrap"><table className="data-table">
          <thead><tr><th>Объект</th><th>План</th><th>Работает</th><th>Готовятся</th><th>Уходят / отсутствуют</th><th>Прогноз</th><th>Дефицит</th></tr></thead>
          <tbody>{objectIds.map(objectId=>{
            const scope=rows.filter(row=>row.objectId===objectId);
            const required=scope.reduce((sum,row)=>sum+row.required,0);
            const working=scope.reduce((sum,row)=>sum+row.working,0);
            const preparing=scope.reduce((sum,row)=>sum+row.preparing,0);
            const losses=scope.reduce((sum,row)=>sum+row.confirmedAbsences+row.plannedExits,0);
            const projected=scope.reduce((sum,row)=>sum+row.projectedAvailable,0);
            const deficit=scope.reduce((sum,row)=>sum+row.projectedDeficit,0);
            return <tr key={objectId}>
              <td><Link className="cell-title" href={"/staffing-plan?object="+objectId+"&horizon="+horizon+"&view=objects"}>{scope[0]?.object}</Link><span className="cell-sub">{scope.length} профессий</span></td>
              <td className="num">{required}</td><td className="num">{working}</td><td className="num">{preparing}</td><td className="num">{losses||"—"}</td><td className="num">{projected}</td><td className="num"><Status tone={deficit?"warn":"good"}>{deficit}</Status></td>
            </tr>;
          })}</tbody>
        </table></div>
      </Section>

      {selectedObjectId&&<section className="section staffing-object-focus">
        <div className="section-head"><div><div className="eyebrow">План комплектации</div><h2>{selectedName}</h2><p>Детализация по профессиям и факторам изменения численности</p></div><div className="page-actions"><Link className="button" href={"/objects/"+selectedObjectId+"?tab=staffing"}>Открыть объект</Link><Link className="button primary" href={"/needs?object="+selectedObjectId}>Потребности</Link></div></div>
        <div className="object-focus-grid">
          <div><span>План</span><strong>{selectedRequired}</strong></div>
          <div><span>Работает</span><strong>{selectedWorking}</strong></div>
          <div><span>Прогноз через {horizon} дней</span><strong>{selectedProjected}</strong></div>
          <div><span>Дефицит</span><strong className={selectedDeficit?"priority-critical":""}>{selectedDeficit}</strong></div>
          <div><span>Риск отсутствий</span><strong>{selectedTentative||"—"}</strong></div>
        </div>
        <div className="request-table-wrap"><table className="data-table">
          <thead><tr><th>Профессия</th><th>План</th><th>Работает</th><th>Готовятся</th><th>Подтв. отсутствия</th><th>Плановые выходы</th><th>Риск отсутствий</th><th>Прогноз</th><th>Дефицит</th><th>Действие</th></tr></thead>
          <tbody>{selectedRows.map(row=><tr key={row.specialtyId}>
            <td className="cell-title">{row.specialty}</td><td className="num">{row.required}</td><td className="num">{row.working}</td><td className="num">{row.preparing}</td><td className="num">{row.confirmedAbsences||"—"}</td><td className="num">{row.plannedExits||"—"}</td><td className="num">{row.tentativeAbsences||"—"}</td><td className="num">{row.projectedAvailable}</td><td className="num"><Status tone={row.projectedDeficit?"warn":"good"}>{row.projectedDeficit}</Status></td><td>{row.projectedDeficit?<Link className="button" href={"/needs?object="+row.objectId}>Создать / увеличить потребность</Link>:<span className="cell-sub">Покрыто</span>}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="staffing-drivers">
          <div><span>+ Готовятся к выходу</span><strong>{selectedIncoming}</strong></div>
          <div><span>− Подтверждённые отсутствия</span><strong>{selectedConfirmedAbsences}</strong></div>
          <div><span>− Плановые завершения</span><strong>{selectedExits}</strong></div>
          <div><span>Риск: предварительные отсутствия</span><strong>{selectedTentative}</strong></div>
        </div>
      </section>}
    </>}

    {view==="specialties"&&<Section title="Профессии по всему контуру" note="Сводка показывает, в каких профессиях дефицит повторяется сразу на нескольких объектах.">
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Профессия</th><th>Объектов</th><th>План</th><th>Работает</th><th>Готовятся</th><th>Прогноз</th><th>Дефицит</th></tr></thead><tbody>{specialties.map(row=><tr key={row.specialty}><td className="cell-title">{row.specialty}</td><td className="num">{row.objects}</td><td className="num">{row.required}</td><td className="num">{row.working}</td><td className="num">{row.preparing}</td><td className="num">{row.projected}</td><td className="num"><Status tone={row.deficit?"warn":"good"}>{row.deficit}</Status></td></tr>)}</tbody></table></div>
    </Section>}

    {view==="forecast"&&<Section title={"Прогноз на "+horizon+" дней"} note="Подтверждённые отсутствия и плановые завершения уменьшают прогноз. Предварительные планы показываются отдельным риском.">
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект / профессия</th><th>Сейчас</th><th>+ Готовятся</th><th>− Подтв. отсутствия</th><th>− Завершения</th><th>Риск отсутствий</th><th>Прогноз</th><th>План</th><th>Дефицит</th></tr></thead><tbody>{[...rows].sort((a,b)=>b.projectedDeficit-a.projectedDeficit).map(row=><tr key={row.objectId+":"+row.specialtyId}><td><Link className="cell-title" href={"/objects/"+row.objectId+"?tab=staffing"}>{row.object}</Link><span className="cell-sub">{row.specialty}</span></td><td className="num">{row.working}</td><td className="num">+{row.preparing}</td><td className="num">{row.confirmedAbsences?"−"+row.confirmedAbsences:"—"}</td><td className="num">{row.plannedExits?"−"+row.plannedExits:"—"}</td><td className="num">{row.tentativeAbsences||"—"}</td><td className="num">{row.projectedAvailable}</td><td className="num">{row.required}</td><td className="num"><Status tone={row.projectedDeficit?"warn":"good"}>{row.projectedDeficit}</Status></td></tr>)}</tbody></table></div>
    </Section>}

    {view==="needs"&&<Section title="Потребности как исполнительный контур" note="План комплектации определяет дефицит, а потребность передаёт конкретное задание в подбор.">
      <div className="staffing-needs-callout"><div><strong>План → дефицит → потребность → подбор → подготовка → фактический выход</strong><p>Потребности не дублируют план численности: они создаются только на объём, который нужно закрыть.</p></div><Link className="button primary" href="/needs">Открыть потребности</Link></div>
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект / профессия</th><th>План</th><th>Прогноз</th><th>Нужно закрыть</th><th>Действие</th></tr></thead><tbody>{rows.filter(row=>row.projectedDeficit>0).map(row=><tr key={row.objectId+":"+row.specialtyId}><td><Link className="cell-title" href={"/objects/"+row.objectId+"?tab=staffing"}>{row.object}</Link><span className="cell-sub">{row.specialty}</span></td><td className="num">{row.required}</td><td className="num">{row.projectedAvailable}</td><td className="num"><strong className="priority-critical">{row.projectedDeficit}</strong></td><td><Link className="button" href={"/needs?object="+row.objectId}>Потребности</Link></td></tr>)}</tbody></table></div>
    </Section>}
  </>;
}
