import { requireActor } from "@/lib/auth/server";
import { getCompanyProfile, listCompanyEmployees, listOrganizationUnits } from "@/lib/organization/service";
import { PageHeader, SummaryStrip } from "@/components/UI";
import { OrganizationTabs } from "@/components/OrganizationTabs";
import { OrganizationChart } from "@/components/OrganizationChart";
import { OrganizationCreatePanel } from "@/components/OrganizationCreatePanel";
import { hasCapability } from "@/lib/core/access.mjs";

export default async function OrganizationStructurePage(){
  const actor=await requireActor();const [company,units,employees]=await Promise.all([getCompanyProfile(actor),listOrganizationUnits(actor),listCompanyEmployees(actor)]);
  const canManage=hasCapability(actor.access,"organization.unit.manage");
  return <><PageHeader eyebrow="Организация" title="Оргструктура" subtitle="Подразделения, руководители, сотрудники и функциональные роли в единой структуре." breadcrumbs={[{label:"Организация"},{label:"Структура"},{label:"Оргструктура"}]} actions={<OrganizationCreatePanel kind="unit" canManage={canManage} demo={actor.demo} units={units} employees={employees}/>}/><OrganizationTabs active="/organization/structure"/><SummaryStrip><span>Компания <strong>{company.name}</strong></span><span>Подразделения <strong>{units.length}</strong></span><span>Сотрудники <strong>{employees.length}</strong></span><span>Регионы <strong>{company.regions.length}</strong></span></SummaryStrip><OrganizationChart units={units} employees={employees}/></>;
}
