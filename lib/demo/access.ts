import type { Actor, EffectiveAccess, ScopeGrant } from "@/lib/access/types";

const ORG = "00000000-0000-4000-8000-000000000001";
const MOW = "30000000-0000-4000-8000-000000000001";
const KLG = "30000000-0000-4000-8000-000000000002";
const VLA = "30000000-0000-4000-8000-000000000003";
const TEAM_SALES = "20000000-0000-4000-8000-000000000001";
const TEAM_OPS = "20000000-0000-4000-8000-000000000002";
const TEAM_REC = "20000000-0000-4000-8000-000000000003";
const TEAM_FIN = "20000000-0000-4000-8000-000000000004";

const COMMERCIAL = ["approval.read","approval.decide","sales.request.archive","sales.proposal.read","sales.proposal.create","sales.proposal.edit","sales.proposal.submit","sales.proposal.client_decision","sales.proposal.launch","contract.read","contract.create","contract.edit","contract.submit","contract.sign","contract.launch_exception"];
const ALL = [
  "home.command.read","task.read","task.edit","sales.lead.read","sales.lead.create","sales.lead.edit",
  "sales.client.read","sales.client.create","sales.client.edit","sales.request.read","sales.request.create","sales.request.edit",...COMMERCIAL,
  "calculation.scenario.read","calculation.scenario.create","calculation.scenario.edit","calculation.scenario.approve","calculation.rate_reference.read","calculation.rate_reference.edit","calculation.rules.read","calculation.rules.manage",
  "operations.object.read","operations.object.edit","operations.need.read","operations.need.create","operations.need.edit","operations.shift.read","operations.shift.edit","operations.crew.read","operations.crew.manage","assets.read","assets.manage","supply.housing.read","supply.housing.manage",
  "recruiting.candidate.read","recruiting.candidate.create","recruiting.candidate.edit","recruiting.candidate.assign","recruiting.candidate.convert","recruiting.analytics.configure","recruiting.pipeline.configure","recruiting.sources.manage",
  "worker.read","worker.edit","worker.offboarding.manage","worker.compensation.read","worker.personal_docs.read","time.time_entry.read","time.time_entry.edit",
  "time.timesheet.read","time.timesheet.edit","time.timesheet.submit","time.timesheet.approve_client",
  "finance.worker_accrual.read","finance.worker_accrual.edit","finance.payments.read","finance.payments.edit","finance.daily_payment.confirm","finance.client_margin.read","finance.pnl.read",
  "analytics.portfolio.read","audit.read","admin.permissions.manage","admin.system_access.manage","organization.read","organization.manage","organization.unit.manage","organization.position.manage","organization.employee.manage","organization.access.manage"
];

function scoped(caps: string[], type: ScopeGrant["type"], ids: string[] = []): EffectiveAccess {
  return { capabilities: caps, denies: [], allOrg: type === "all_org", scopes: Object.fromEntries(caps.map((c) => [c, [{ type, ids }]])) };
}

const DEMO_ACTORS: Record<string, Actor> = {
  director: { userId:"10000000-0000-4000-8000-000000000001",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000001",displayName:"Анна Лебедева",email:"director@beta.local",roleCode:"director",roleName:"Директор",positionId:"41000000-0000-4000-8000-000000000001",positionName:"Генеральный директор / собственник",teamIds:[TEAM_OPS],orgUnitIds:["21000000-0000-4000-8000-000000000002"],regionIds:[MOW,KLG,VLA],access:scoped(["*",...ALL],"all_org"),demo:true },
  sales: { userId:"10000000-0000-4000-8000-000000000002",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000002",displayName:"Михаил Соколов",email:"commercial@beta.local",roleCode:"commercial_lead",roleName:"Руководитель коммерческого направления",positionId:"41000000-0000-4000-8000-000000000002",positionName:"Руководитель коммерческого направления",teamIds:[TEAM_SALES],orgUnitIds:["21000000-0000-4000-8000-000000000003"],regionIds:[MOW,KLG,VLA],access:scoped(["home.command.read","task.read","task.edit","sales.lead.read","sales.lead.create","sales.lead.edit","sales.client.read","sales.client.create","sales.client.edit","sales.request.read","sales.request.create","sales.request.edit","sales.request.archive","sales.proposal.read","sales.proposal.create","sales.proposal.edit","sales.proposal.submit","sales.proposal.client_decision","sales.proposal.launch","contract.read","contract.create","contract.edit","contract.submit","approval.read","calculation.scenario.read","calculation.scenario.create","calculation.rate_reference.read","organization.read"],"all_org"),demo:true },
  regional: { userId:"10000000-0000-4000-8000-000000000003",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000003",displayName:"Алексей Громов",email:"operations@beta.local",roleCode:"operations_head",roleName:"Руководитель объектов",positionId:"41000000-0000-4000-8000-000000000004",positionName:"Руководитель объектов",teamIds:[TEAM_OPS],orgUnitIds:["21000000-0000-4000-8000-000000000005"],regionIds:[MOW,KLG,VLA],access:scoped(["home.command.read","task.read","task.edit","approval.read","approval.decide","sales.client.read","sales.request.read","contract.read","operations.object.read","operations.object.create","operations.object.assign","operations.object.edit","operations.need.read","operations.need.edit","operations.shift.read","operations.shift.edit","operations.crew.read","operations.crew.manage","assets.read","assets.manage","procurement.read","procurement.manage","supply.housing.read","supply.housing.manage","recruiting.candidate.read","worker.read","worker.edit","worker.offboarding.manage","time.time_entry.read","time.timesheet.read","time.timesheet.edit","time.timesheet.review","worker.compensation.read","finance.worker_accrual.read","finance.payments.read","finance.daily_payment.confirm","finance.pnl.read","analytics.portfolio.read","organization.read"],"assigned_to_me"),demo:true },
  client: { userId:"10000000-0000-4000-8000-000000000008",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000008",displayName:"Анна Воронова",email:"client1@beta.local",roleCode:"client_manager",roleName:"Менеджер клиентских заявок",positionId:"41000000-0000-4000-8000-000000000003",positionName:"Менеджер по клиентским заявкам",teamIds:[TEAM_SALES],orgUnitIds:["21000000-0000-4000-8000-000000000004"],regionIds:[MOW,KLG,VLA],access:scoped(["home.command.read","task.read","task.edit","sales.client.read","sales.client.create","sales.client.edit","sales.request.read","sales.request.create","sales.request.edit","sales.proposal.read","organization.read"],"assigned_to_me"),demo:true },
  object: { userId:"10000000-0000-4000-8000-000000000004",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000004",displayName:"Дмитрий Орлов",email:"object1@beta.local",roleCode:"object_manager",roleName:"Менеджер объекта",positionId:"41000000-0000-4000-8000-000000000005",positionName:"Менеджер объекта",teamIds:[TEAM_OPS],orgUnitIds:["21000000-0000-4000-8000-000000000006"],regionIds:[MOW,KLG],access:scoped(["home.command.read","task.read","task.edit","operations.object.read","operations.object.edit","operations.need.read","operations.need.edit","operations.shift.read","operations.shift.edit","operations.crew.read","operations.crew.manage","assets.read","assets.manage","procurement.read","procurement.manage","supply.housing.read","supply.housing.manage","recruiting.candidate.read","worker.read","worker.edit","time.time_entry.read","time.time_entry.edit","time.timesheet.read","time.timesheet.edit","time.timesheet.submit","worker.compensation.read","finance.worker_accrual.read","finance.payments.read","finance.daily_payment.confirm","organization.read"],"assigned_to_me"),demo:true },
  supply: { userId:"10000000-0000-4000-8000-000000000011",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000011",displayName:"Ирина Белова",email:"supply@beta.local",roleCode:"supply_specialist",roleName:"Снабжение и документооборот",positionId:"41000000-0000-4000-8000-000000000006",positionName:"Специалист по снабжению и документообороту",teamIds:[TEAM_OPS],orgUnitIds:["21000000-0000-4000-8000-000000000007"],regionIds:[MOW,KLG,VLA],access:scoped(["home.command.read","task.read","task.edit","operations.object.read","assets.read","assets.manage","procurement.read","procurement.manage","supply.housing.read","supply.housing.manage","organization.read"],"all_org"),demo:true },
  recruiter: { userId:"10000000-0000-4000-8000-000000000005",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000005",displayName:"Мария Лебедева",email:"recruitment@beta.local",roleCode:"recruitment_head",roleName:"Руководитель отдела подбора",positionId:"41000000-0000-4000-8000-000000000007",positionName:"Руководитель отдела подбора",teamIds:[TEAM_REC],orgUnitIds:["21000000-0000-4000-8000-000000000008"],regionIds:[MOW,KLG,VLA],access:scoped(["home.command.read","task.read","task.edit","operations.need.read","operations.need.edit","recruiting.candidate.read","recruiting.candidate.create","recruiting.candidate.edit","recruiting.candidate.assign","recruiting.analytics.configure","worker.read","organization.read"],"all_org"),demo:true },
  recruiter_staff: { userId:"10000000-0000-4000-8000-000000000012",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000012",displayName:"Ольга Зайцева",email:"recruiter1@beta.local",roleCode:"recruiter",roleName:"Менеджер по подбору",positionId:"41000000-0000-4000-8000-000000000008",positionName:"Менеджер по подбору",teamIds:[TEAM_REC],orgUnitIds:["21000000-0000-4000-8000-000000000009"],regionIds:[MOW,KLG,VLA],access:scoped(["home.command.read","task.read","task.edit","operations.need.read","recruiting.candidate.read","recruiting.candidate.create","recruiting.candidate.edit","recruiting.candidate.assign","recruiting.candidate.convert","worker.read","organization.read"],"assigned_to_me"),demo:true },
  economist: { userId:"10000000-0000-4000-8000-000000000006",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000006",displayName:"Елена Котова",email:"economist@beta.local",roleCode:"finance_economist",roleName:"Экономист / финансовый менеджер",positionId:"41000000-0000-4000-8000-000000000009",positionName:"Экономист / финансовый менеджер",teamIds:[TEAM_FIN],orgUnitIds:["21000000-0000-4000-8000-000000000010"],regionIds:[MOW,KLG,VLA],access:scoped(["home.command.read","task.read","task.edit","approval.read","approval.decide","sales.client.read","sales.request.read","sales.proposal.read","contract.read","calculation.scenario.read","calculation.scenario.create","calculation.scenario.edit","calculation.scenario.approve","calculation.rate_reference.read","calculation.rate_reference.edit","calculation.rules.read","calculation.rules.manage","operations.object.read","worker.read","worker.compensation.read","time.time_entry.read","time.time_entry.edit","time.timesheet.read","time.timesheet.edit","time.timesheet.review","time.timesheet.approve_client","finance.worker_accrual.read","finance.worker_accrual.edit","finance.payments.read","finance.payments.edit","finance.daily_payment.confirm","finance.client_margin.read","finance.pnl.read","analytics.portfolio.read","organization.read"],"all_org"),demo:true },
  finance: { userId:"10000000-0000-4000-8000-000000000006",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000006",displayName:"Елена Котова",email:"economist@beta.local",roleCode:"finance_economist",roleName:"Экономист / финансовый менеджер",positionId:"41000000-0000-4000-8000-000000000009",positionName:"Экономист / финансовый менеджер",teamIds:[TEAM_FIN],orgUnitIds:["21000000-0000-4000-8000-000000000010"],regionIds:[MOW,KLG,VLA],access:scoped(["home.command.read","task.read","task.edit","approval.read","approval.decide","sales.client.read","sales.request.read","sales.proposal.read","contract.read","calculation.scenario.read","calculation.scenario.create","calculation.scenario.edit","calculation.scenario.approve","calculation.rate_reference.read","calculation.rate_reference.edit","calculation.rules.read","calculation.rules.manage","operations.object.read","worker.read","worker.compensation.read","time.time_entry.read","time.time_entry.edit","time.timesheet.read","time.timesheet.edit","time.timesheet.review","time.timesheet.approve_client","finance.worker_accrual.read","finance.worker_accrual.edit","finance.payments.read","finance.payments.edit","finance.daily_payment.confirm","finance.client_margin.read","finance.pnl.read","analytics.portfolio.read","organization.read"],"all_org"),demo:true },
}

DEMO_ACTORS.client_2 = {
  ...DEMO_ACTORS.client,
  userId:"10000000-0000-4000-8000-000000000009",
  membershipId:"50000000-0000-4000-8000-000000000009",
  displayName:"Елена Морозова",
  email:"client2@beta.local",
};
DEMO_ACTORS.object_2 = {
  ...DEMO_ACTORS.object,
  userId:"10000000-0000-4000-8000-000000000010",
  membershipId:"50000000-0000-4000-8000-000000000010",
  displayName:"Павел Никитин",
  email:"object2@beta.local",
  regionIds:[MOW,VLA],
};
DEMO_ACTORS.recruiter_staff_2 = {
  ...DEMO_ACTORS.recruiter_staff,
  userId:"10000000-0000-4000-8000-000000000013",
  membershipId:"50000000-0000-4000-8000-000000000013",
  displayName:"Ксения Волкова",
  email:"recruiter2@beta.local",
};
DEMO_ACTORS.recruiter_staff_3 = {
  ...DEMO_ACTORS.recruiter_staff,
  userId:"10000000-0000-4000-8000-000000000014",
  membershipId:"50000000-0000-4000-8000-000000000014",
  displayName:"Наталья Фомина",
  email:"recruiter3@beta.local",
};

export function getDemoActor(code = "director") { return DEMO_ACTORS[code] ?? DEMO_ACTORS.director; }
export function demoActors() { return Object.entries(DEMO_ACTORS).filter(([code])=>code!=="finance").map(([code, actor]) => ({ code, name: actor.displayName, role: actor.roleName })); }