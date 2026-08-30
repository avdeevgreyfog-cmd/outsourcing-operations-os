import type { Actor, EffectiveAccess, ScopeGrant } from "@/lib/access/types";

const ORG = "00000000-0000-4000-8000-000000000001";
const MOW = "30000000-0000-4000-8000-000000000001";
const KLG = "30000000-0000-4000-8000-000000000002";
const TEAM_SALES = "20000000-0000-4000-8000-000000000001";
const TEAM_OPS = "20000000-0000-4000-8000-000000000002";
const TEAM_REC = "20000000-0000-4000-8000-000000000003";
const TEAM_FIN = "20000000-0000-4000-8000-000000000004";

const ALL = [
  "home.command.read","task.read","task.edit","sales.lead.read","sales.lead.create","sales.lead.edit",
  "sales.client.read","sales.client.create","sales.client.edit","sales.request.read","sales.request.create","sales.request.edit",
  "calculation.scenario.read","calculation.scenario.create","calculation.scenario.edit","calculation.scenario.approve","calculation.rate_reference.read","calculation.rate_reference.edit",
  "operations.object.read","operations.object.edit","operations.need.read","operations.need.edit","operations.shift.read","operations.shift.edit",
  "recruiting.candidate.read","recruiting.candidate.create","recruiting.candidate.edit","recruiting.candidate.assign",
  "worker.read","worker.edit","worker.compensation.read","worker.personal_docs.read","time.time_entry.read","time.time_entry.edit",
  "time.timesheet.read","time.timesheet.edit","time.timesheet.submit","time.timesheet.approve_client",
  "finance.worker_accrual.read","finance.worker_accrual.edit","finance.payments.read","finance.payments.edit","finance.client_margin.read","finance.pnl.read",
  "analytics.portfolio.read","audit.read","admin.permissions.manage"
];

function scoped(caps: string[], type: ScopeGrant["type"], ids: string[] = []): EffectiveAccess {
  return { capabilities: caps, denies: [], allOrg: type === "all_org", scopes: Object.fromEntries(caps.map((c) => [c, [{ type, ids }]])) };
}

const DEMO_ACTORS: Record<string, Actor> = {
  director: { userId:"10000000-0000-4000-8000-000000000001",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000001",displayName:"Анна Лебедева",email:"director@demo.local",roleCode:"director",roleName:"Director",teamIds:[TEAM_OPS],regionIds:[MOW,KLG],access:scoped(ALL,"all_org"),demo:true },
  sales: { userId:"10000000-0000-4000-8000-000000000002",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000002",displayName:"Илья Морозов",email:"sales@demo.local",roleCode:"sales_manager",roleName:"Sales Manager",teamIds:[TEAM_SALES],regionIds:[MOW,KLG],access:scoped(["home.command.read","task.read","task.edit","sales.lead.read","sales.lead.create","sales.lead.edit","sales.client.read","sales.client.create","sales.client.edit","sales.request.read","sales.request.create","sales.request.edit","calculation.scenario.read","calculation.scenario.create","calculation.rate_reference.read"],"team"),demo:true },
  regional: { userId:"10000000-0000-4000-8000-000000000003",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000003",displayName:"Мария Соколова",email:"regional@demo.local",roleCode:"regional_manager",roleName:"Regional Manager",teamIds:[TEAM_OPS],regionIds:[MOW],access:scoped(["home.command.read","task.read","task.edit","sales.client.read","sales.request.read","operations.object.read","operations.object.edit","operations.need.read","operations.need.edit","operations.shift.read","operations.shift.edit","recruiting.candidate.read","worker.read","time.time_entry.read","time.timesheet.read","time.timesheet.edit","analytics.portfolio.read"],"region",[MOW]),demo:true },
  object: { userId:"10000000-0000-4000-8000-000000000004",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000004",displayName:"Алексей Волков",email:"object@demo.local",roleCode:"object_manager",roleName:"Object Manager",teamIds:[TEAM_OPS],regionIds:[MOW],access:scoped(["home.command.read","task.read","task.edit","operations.object.read","operations.object.edit","operations.need.read","operations.need.edit","operations.shift.read","operations.shift.edit","recruiting.candidate.read","worker.read","time.time_entry.read","time.time_entry.edit","time.timesheet.read","time.timesheet.edit","time.timesheet.submit"],"assigned_to_me"),demo:true },
  recruiter: { userId:"10000000-0000-4000-8000-000000000005",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000005",displayName:"Ольга Новикова",email:"recruiter@demo.local",roleCode:"recruiter",roleName:"Recruiter",teamIds:[TEAM_REC],regionIds:[MOW],access:scoped(["home.command.read","task.read","task.edit","operations.need.read","recruiting.candidate.read","recruiting.candidate.create","recruiting.candidate.edit","recruiting.candidate.assign","worker.read"],"assigned_to_me"),demo:true },
  economist: { userId:"10000000-0000-4000-8000-000000000006",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000006",displayName:"Елена Котова",email:"economist@demo.local",roleCode:"economist",roleName:"Economist",teamIds:[TEAM_FIN],regionIds:[MOW,KLG],access:scoped(["home.command.read","sales.client.read","sales.request.read","calculation.scenario.read","calculation.scenario.create","calculation.scenario.edit","calculation.scenario.approve","calculation.rate_reference.read","calculation.rate_reference.edit","finance.client_margin.read"],"all_org"),demo:true },
  finance: { userId:"10000000-0000-4000-8000-000000000007",organizationId:ORG,membershipId:"50000000-0000-4000-8000-000000000007",displayName:"Дмитрий Орлов",email:"finance@demo.local",roleCode:"finance",roleName:"Finance",teamIds:[TEAM_FIN],regionIds:[MOW,KLG],access:scoped(["home.command.read","sales.client.read","operations.object.read","worker.read","worker.compensation.read","time.time_entry.read","time.timesheet.read","time.timesheet.approve_client","finance.worker_accrual.read","finance.worker_accrual.edit","finance.payments.read","finance.payments.edit","finance.client_margin.read","finance.pnl.read","analytics.portfolio.read"],"all_org"),demo:true },
};

export function getDemoActor(code = "director") { return DEMO_ACTORS[code] ?? DEMO_ACTORS.director; }
export function demoActors() { return Object.entries(DEMO_ACTORS).map(([code, actor]) => ({ code, name: actor.displayName, role: actor.roleName })); }
