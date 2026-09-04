import { requireActor } from "@/lib/auth/server";
import { listCompanyEmployees, listOrganizationUnits, listPositionAssignments, listPositions, listProcessRoles, listResponsibilityRules, listStaffPositions } from "@/lib/organization/service";
import { PageHeader, Section, SummaryStrip } from "@/components/UI";
import { OrganizationTabs } from "@/components/OrganizationTabs";
import { PositionCatalog } from "@/components/PositionCatalog";
import { OrganizationCreatePanel } from "@/components/OrganizationCreatePanel";
import { hasCapability } from "@/lib/core/access.mjs";

export default async function PositionsPage(){
  const actor=await requireActor();const [profiles,staffPositions,assignments,roles,responsibilities,units,employees]=await Promise.all([listPositions(actor),listStaffPositions(actor),listPositionAssignments(actor),listProcessRoles(actor),listResponsibilityRules(actor),listOrganizationUnits(actor),listCompanyEmployees(actor)]);const canManage=hasCapability(actor.access,"organization.position.manage");
  const capacity=staffPositions.reduce((sum,item)=>sum+item.capacity,0);const open=staffPositions.reduce((sum,item)=>sum+item.open,0);
  return <><PageHeader eyebrow="Организация" title="Должности и обязанности" subtitle="Профили описывают работу, штатные позиции — конкретные места в структуре, процессные роли — функции и ответственность." breadcrumbs={[{label:"Организация"},{label:"Структура"},{label:"Должности и обязанности"}]} actions={<div className="page-action-row"><OrganizationCreatePanel kind="position" canManage={canManage} demo={actor.demo}/><OrganizationCreatePanel kind="staffPosition" canManage={canManage} demo={actor.demo} positions={profiles} staffPositions={staffPositions} units={units}/><OrganizationCreatePanel kind="role" canManage={canManage} demo={actor.demo}/></div>}/><OrganizationTabs active="/organization/positions"/><SummaryStrip><span>Профили <strong>{profiles.length}</strong></span><span>Штат <strong>{capacity}</strong></span><span>Занято <strong>{capacity-open}</strong></span><span>Вакансии <strong>{open}</strong></span><span>Процессные роли <strong>{roles.length}</strong></span></SummaryStrip><Section flush><PositionCatalog profiles={profiles} staffPositions={staffPositions} assignments={assignments} roles={roles} responsibilities={responsibilities} employees={employees} units={units} canManage={canManage} demo={actor.demo}/></Section></>;
}
