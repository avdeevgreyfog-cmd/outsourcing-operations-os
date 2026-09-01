import { requireActor } from "@/lib/auth/server";
import { getCompanyProfile, listCompanyEmployees, listOrganizationChangeSets, listOrganizationUnits, listPositionAssignments, listStaffPositions } from "@/lib/organization/service";
import { PageHeader, Section, Status, SummaryStrip } from "@/components/UI";
import { OrganizationTabs } from "@/components/OrganizationTabs";
import { OrganizationCreatePanel } from "@/components/OrganizationCreatePanel";
import { OrganizationTemplatePanel } from "@/components/OrganizationTemplatePanel";
import { DepartmentRegistry } from "@/components/DepartmentRegistry";
import { hasCapability } from "@/lib/core/access.mjs";
import { findStructureIssues } from "@/lib/core/organization.mjs";

const changeLabels = { draft: "Черновик", review: "На проверке", approved: "Согласовано", scheduled: "Запланировано", applied: "Применено", cancelled: "Отменено" };

export default async function DepartmentsPage() {
  const actor = await requireActor();
  const [company, units, employees, staffPositions, assignments, changeSets] = await Promise.all([getCompanyProfile(actor), listOrganizationUnits(actor), listCompanyEmployees(actor), listStaffPositions(actor), listPositionAssignments(actor), listOrganizationChangeSets(actor)]);
  const canManage = hasCapability(actor.access, "organization.unit.manage");
  const issues = findStructureIssues({ units, staffPositions, assignments });
  return <>
    <PageHeader eyebrow="Организация" title="Подразделения и регионы" subtitle="Иерархия единиц, руководители, штат и датированные изменения структуры." breadcrumbs={[{ label: "Организация" }, { label: "Структура" }, { label: "Подразделения и регионы" }]} actions={<OrganizationCreatePanel kind="unit" canManage={canManage} demo={actor.demo} units={units} employees={employees} />} />
    <OrganizationTabs active="/organization/departments" />
    <SummaryStrip><span>Компания <strong>{company.name}</strong></span><span>Подразделения <strong>{units.length}</strong></span><span>Регионы <strong>{company.regions.length}</strong></span><span>Сотрудники <strong>{employees.length}</strong></span><span>Вакансии <strong>{staffPositions.reduce((sum, item) => sum + item.open, 0)}</strong></span><span>Проблемы <strong>{issues.length}</strong></span></SummaryStrip>
    <DepartmentRegistry units={units} employees={employees} staffPositions={staffPositions} />
    <div className="organization-admin-grid">
      <Section title="Изменения структуры" note="Пакет применяется целиком на указанную дату"><table className="data-table"><thead><tr><th>Пакет</th><th>Дата</th><th>Изменения</th><th>Статус</th></tr></thead><tbody>{changeSets.map((item) => <tr key={item.id}><td><span className="cell-title">{item.title}</span><span className="cell-sub">{item.createdBy}</span></td><td>{item.effectiveDate}</td><td className="num">{item.itemCount}</td><td><Status tone={item.status === "applied" ? "good" : item.status === "review" ? "warn" : "info"}>{changeLabels[item.status]}</Status></td></tr>)}</tbody></table></Section>
      <Section title="Контроль структуры" note="Проблемы, влияющие на маршрутизацию и ответственность"><div className="structure-issues">{issues.map((issue) => <div key={issue.id}><Status tone={issue.severity === "warning" ? "warn" : "info"}>{issue.severity === "warning" ? "Проверить" : "Информация"}</Status><span><strong>{issue.label}</strong><small>{issue.message}</small></span></div>)}</div></Section>
    </div>
    <Section title="Шаблоны структуры" note="Шаблон добавляет только недостающие подразделения и не удаляет текущую структуру"><OrganizationTemplatePanel canManage={canManage} /></Section>
  </>;
}
