import { requireActor } from "@/lib/auth/server";
import { listCompanyEmployees, listOrganizationUnits, listPositionAssignments, listPositions, listProcessRoles, listStaffPositions } from "@/lib/organization/service";
import { PageHeader, SummaryStrip } from "@/components/UI";
import { OrganizationTabs } from "@/components/OrganizationTabs";
import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import { OrganizationCreatePanel } from "@/components/OrganizationCreatePanel";
import { hasCapability } from "@/lib/core/access.mjs";

export default async function CompanyStaffPage(){
  const actor=await requireActor();
  const [employees,units,positions,roles,assignments,staffPositions]=await Promise.all([listCompanyEmployees(actor),listOrganizationUnits(actor),listPositions(actor),listProcessRoles(actor),listPositionAssignments(actor),listStaffPositions(actor)]);
  const canManage=hasCapability(actor.access,"organization.employee.manage");
  return <><PageHeader eyebrow="Организация" title="Сотрудники компании" subtitle="Назначения, процессные роли, ответственность и происхождение доступа сотрудников." breadcrumbs={[{label:"Организация"},{label:"Структура"},{label:"Сотрудники компании"}]} actions={<OrganizationCreatePanel kind="employee" canManage={canManage} demo={actor.demo} units={units} positions={positions} staffPositions={staffPositions} roles={roles} employees={employees}/>}/><OrganizationTabs active="/organization/staff"/><SummaryStrip><span>Всего <strong>{employees.length}</strong></span><span>Активны <strong>{employees.filter(x=>x.status==="active").length}</strong></span><span>Подразделения <strong>{new Set(employees.map(x=>x.orgUnitId).filter(Boolean)).size}</strong></span><span>Доп. назначения <strong>{assignments.filter(x=>x.assignmentType!=="primary"&&x.status!=="ended").length}</strong></span><span>С процессными ролями <strong>{employees.filter(x=>x.roles.length>0).length}</strong></span></SummaryStrip><EmployeeDirectory employees={employees} assignments={assignments} canManage={canManage} demo={actor.demo}/></>;
}
