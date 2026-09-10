import { requireActor } from "@/lib/auth/server";
import { getCompanyProfile, listCompanyEmployees, listOrganizationUnits, listPositionAssignments, listStaffPositions } from "@/lib/organization/service";
import { PageHeader, SummaryStrip } from "@/components/UI";
import { OrganizationTabs } from "@/components/OrganizationTabs";
import { OrganizationChart } from "@/components/OrganizationChart";
import { OrganizationCreatePanel } from "@/components/OrganizationCreatePanel";
import { hasCapability } from "@/lib/core/access.mjs";

export default async function OrganizationStructurePage(){
  const actor=await requireActor();const [company,units,employees,staffPositions,assignments]=await Promise.all([getCompanyProfile(actor),listOrganizationUnits(actor),listCompanyEmployees(actor),listStaffPositions(actor),listPositionAssignments(actor)]);
  const canManage=hasCapability(actor.access,"organization.unit.manage");
  const unitsWithoutLead=units.filter((item)=>item.kind!=="company"&&!item.managerMembershipId).length;
  const vacancies=staffPositions.reduce((sum,item)=>sum+item.open,0);
  return <><PageHeader eyebrow="Организация" title="Оргструктура" subtitle="Карта людей, подчинения и ответственности компании." breadcrumbs={[{label:"Организация"},{label:"Структура"},{label:"Оргструктура"}]} actions={<OrganizationCreatePanel kind="unit" canManage={canManage} demo={actor.demo} units={units} employees={employees}/>}/><OrganizationTabs active="/organization/structure"/><SummaryStrip><span>Компания <strong>{company.name}</strong></span><span>Подразделения <strong>{units.length}</strong></span><span>Сотрудники <strong>{employees.length}</strong></span><span>Вакансии <strong>{vacancies}</strong></span><span className={unitsWithoutLead ? "summary-warning" : ""}>Без руководителя <strong>{unitsWithoutLead}</strong></span></SummaryStrip><OrganizationChart units={units} employees={employees} staffPositions={staffPositions} assignments={assignments} currentEmployeeId={actor.membershipId}/></>;
}
