import { requireActor } from "@/lib/auth/server";
import { listPositions, listProcessRoles } from "@/lib/organization/service";
import { PageHeader, Section, SummaryStrip } from "@/components/UI";
import { OrganizationTabs } from "@/components/OrganizationTabs";
import { PositionCatalog } from "@/components/PositionCatalog";
import { OrganizationCreatePanel } from "@/components/OrganizationCreatePanel";
import { hasCapability } from "@/lib/core/access.mjs";

export default async function PositionsPage(){
  const actor=await requireActor();const [positions,roles]=await Promise.all([listPositions(actor),listProcessRoles(actor)]);const canManage=hasCapability(actor.access,"organization.position.manage");
  return <><PageHeader eyebrow="Организация" title="Должности и роли" subtitle="Должность задаёт место человека в компании, процессная роль — его функцию в конкретных рабочих контурах." breadcrumbs={[{label:"Организация"},{label:"Структура"},{label:"Должности и роли"}]} actions={<div className="page-action-row"><OrganizationCreatePanel kind="position" canManage={canManage} demo={actor.demo}/><OrganizationCreatePanel kind="role" canManage={canManage} demo={actor.demo}/></div>}/><OrganizationTabs active="/organization/positions"/><SummaryStrip><span>Должности <strong>{positions.length}</strong></span><span>Процессные роли <strong>{roles.length}</strong></span><span>Наследование <strong>Должность + роли + исключения</strong></span></SummaryStrip><Section flush><PositionCatalog positions={positions} roles={roles}/></Section></>;
}
