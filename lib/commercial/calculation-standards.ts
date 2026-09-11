import type { Actor } from "@/lib/access/types";
import { withTenant } from "@/lib/db/client";

export type ExpenseStandard = {
  id: string; code: string; version: number; name: string; groupName: string; amount: number;
  base: "per_hour"|"per_shift"|"per_worker_month"|"per_worker_period"|"percent_of_worker_pay"|"role_month"|"role_fixed"|"project_month"|"project_fixed"|"per_unit";
  scope: "worker"|"role"|"project"; amortizationMonths: number|null; defaultEnabled: boolean;
  active: boolean; effectiveFrom: string; effectiveTo: string|null; notes: string|null; demo?: boolean;
};

export type ScheduleStandard = {
  id: string; code: string; version: number; name: string; pattern: string; shiftHours: number;
  breakHours: number; breakPaid: boolean; shiftsPerMonth: number; active: boolean;
  effectiveFrom: string; effectiveTo: string|null; notes: string|null; demo?: boolean;
};

const demoExpenses: ExpenseStandard[] = [
  {id:"standard-housing",code:"housing",version:1,name:"Проживание",groupName:"Регулярное обеспечение",amount:0,base:"project_month",scope:"project",amortizationMonths:null,defaultEnabled:false,active:true,effectiveFrom:"2026-01-01",effectiveTo:null,notes:"Заполняется по условиям объекта",demo:true},
  {id:"standard-travel",code:"travel",version:1,name:"Транспорт до объекта",groupName:"Регулярное обеспечение",amount:0,base:"per_shift",scope:"worker",amortizationMonths:null,defaultEnabled:false,active:true,effectiveFrom:"2026-01-01",effectiveTo:null,notes:null,demo:true},
  {id:"standard-medical",code:"medical",version:1,name:"Медосмотр и оформление",groupName:"Периодические и разовые расходы",amount:0,base:"per_worker_period",scope:"worker",amortizationMonths:12,defaultEnabled:false,active:true,effectiveFrom:"2026-01-01",effectiveTo:null,notes:"Амортизируется по сроку действия",demo:true},
  {id:"standard-recruitment",code:"recruitment",version:1,name:"Подбор и ротация",groupName:"Подбор и ротация",amount:0,base:"per_worker_period",scope:"worker",amortizationMonths:4,defaultEnabled:true,active:true,effectiveFrom:"2026-01-01",effectiveTo:null,notes:null,demo:true},
];

const demoSchedules: ScheduleStandard[] = [
  {id:"schedule-52",code:"five_two",version:1,name:"5/2 · дневная",pattern:"5/2",shiftHours:8,breakHours:1,breakPaid:false,shiftsPerMonth:21.7,active:true,effectiveFrom:"2026-01-01",effectiveTo:null,notes:null,demo:true},
  {id:"schedule-1515",code:"watch_1515",version:1,name:"Вахта 15/15",pattern:"15/15",shiftHours:11,breakHours:1,breakPaid:true,shiftsPerMonth:15,active:true,effectiveFrom:"2026-01-01",effectiveTo:null,notes:null,demo:true},
  {id:"schedule-22",code:"two_two",version:1,name:"Сменная 2/2",pattern:"2/2",shiftHours:12,breakHours:1,breakPaid:false,shiftsPerMonth:15.2,active:true,effectiveFrom:"2026-01-01",effectiveTo:null,notes:null,demo:true},
];

export async function getCalculationStandards(actor: Actor, effectiveDate?: string|null) {
  if (actor.demo) return { expenses: demoExpenses, schedules: demoSchedules };
  const date = effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ? effectiveDate : new Date().toISOString().slice(0,10);
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [expenses, schedules] = await Promise.all([
      sql<ExpenseStandard[]>`
        SELECT DISTINCT ON (code) id,code,version,name,group_name "groupName",amount::float8 amount,base,scope,
          amortization_months::float8 "amortizationMonths",default_enabled "defaultEnabled",active,effective_from::text "effectiveFrom",effective_to::text "effectiveTo",notes
        FROM calculation_expense_standard_versions
        WHERE active AND effective_from<=${date}::date AND (effective_to IS NULL OR effective_to>=${date}::date)
        ORDER BY code,version DESC,effective_from DESC
      `,
      sql<ScheduleStandard[]>`
        SELECT DISTINCT ON (code) id,code,version,name,pattern,shift_hours::float8 "shiftHours",break_hours::float8 "breakHours",break_paid "breakPaid",
          shifts_per_month::float8 "shiftsPerMonth",active,effective_from::text "effectiveFrom",effective_to::text "effectiveTo",notes
        FROM calculation_schedule_standard_versions
        WHERE active AND effective_from<=${date}::date AND (effective_to IS NULL OR effective_to>=${date}::date)
        ORDER BY code,version DESC,effective_from DESC
      `,
    ]);
    return { expenses, schedules };
  });
}
