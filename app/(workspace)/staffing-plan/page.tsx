import { requireActor } from "@/lib/auth/server";
import { PageHeader } from "@/components/UI";
import { StaffingPlanWorkspace, type StaffingPlanObject } from "@/components/StaffingPlanWorkspace";
import { listStaffingForecast } from "@/lib/operations/service";
import { listRecruitingApplications } from "@/lib/recruiting/service";
import { listObjects, listTasks, listWorkers } from "@/lib/data/service";
import { canReadRow, hasCapability } from "@/lib/core/access.mjs";
import { isGithubPagesDemo } from "@/lib/demo/pages";

type StaffingView="objects"|"funnel"|"forecast"|"specialties"|"needs";

export default async function StaffingPlanPage({searchParams}:{searchParams:Promise<{horizon?:string;view?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const horizon=Math.max(7,Math.min(90,Number(params.horizon??30)||30));
  const initialView=(["objects","funnel","forecast","specialties","needs"].includes(params.view??"")?params.view:"objects") as StaffingView;

  const canReadObjects=hasCapability(actor.access,"operations.object.read");
  const canRecruiting=hasCapability(actor.access,"recruiting.candidate.read");
  const canWorkers=hasCapability(actor.access,"worker.read");
  const canTasks=hasCapability(actor.access,"task.read");

  const [rows,objectRows,applications,workers,tasks]=await Promise.all([
    listStaffingForecast(actor,horizon),
    canReadObjects?listObjects(actor):Promise.resolve([]),
    canRecruiting?listRecruitingApplications(actor):Promise.resolve([]),
    canWorkers?listWorkers(actor):Promise.resolve([]),
    canTasks?listTasks(actor):Promise.resolve([]),
  ]);

  const objects:StaffingPlanObject[]=objectRows.length?objectRows.map(row=>({
    id:row.id,
    organizationId:row.organizationId,
    name:row.name,
    client:row.client??null,
    region:row.region??null,
    regionId:row.regionId??null,
    status:row.status,
    ownerUserId:row.ownerUserId??null,
    ownerName:row.ownerName??null,
    assigneeUserIds:row.assigneeUserIds??[],
  })):[...new Map(rows.map(row=>[row.objectId,{
    id:row.objectId,
    organizationId:row.organizationId,
    name:row.object,
    client:null,
    region:null,
    regionId:row.regionId,
    status:"active",
    ownerUserId:row.ownerUserId,
    ownerName:null,
    assigneeUserIds:row.assigneeUserIds,
  } satisfies StaffingPlanObject])).values()];

  const editableObjectIds=hasCapability(actor.access,"operations.object.edit")
    ?objectRows.filter(row=>canReadRow(actor.access,"operations.object.edit",row,actor)).map(row=>row.id)
    :[];

  const planCapability=hasCapability(actor.access,"operations.staffing_plan.edit")
    ?"operations.staffing_plan.edit"
    :hasCapability(actor.access,"operations.need.edit")
      ?"operations.need.edit"
      :null;
  const planEditableObjectIds=planCapability
    ?objectRows.filter(row=>canReadRow(actor.access,planCapability,row,actor)).map(row=>row.id)
    :[];

  return <>
    <PageHeader
      eyebrow="Операции → Управление объектами"
      title="План комплектации"
      subtitle="Единый диспетчерский экран по обеспеченности персоналом: все доступные объекты, подтверждённые выходы, прогноз дефицита, кандидаты и замены."
      breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"План комплектации"}]}
    />
    <StaffingPlanWorkspace
      rows={rows}
      applications={applications}
      workers={workers}
      objects={objects}
      tasks={tasks}
      horizon={horizon}
      initialView={initialView}
      editableObjectIds={editableObjectIds}
      planEditableObjectIds={planEditableObjectIds}
      demo={actor.demo}
    />
  </>;
}
