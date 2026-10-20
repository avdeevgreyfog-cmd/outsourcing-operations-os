export class ProposalLaunchSnapshotConflict extends Error {}

export type ProposalLaunchScenario = {
  id:string;requestRoleId:string;specialtyId:string;workers:number|null;
  pricing:Record<string,unknown>;
};
export type ProposalLaunchRole = {
  scenarioId:string;requestRoleId:string;specialtyId:string;count:number;
  amount:number;unit:'hour'|'shift'|'month'|'service';pricing:Record<string,unknown>;
};
const pricingKeys=['scenarioId','billingUnit','variableBillingUnit','clientRateNet','clientRateGross','vatPct','fixedMonthlyNet','minimumMonthlyNet','monthlyRevenueNet','projectMonths'];
const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const numeric=(value:unknown)=>typeof value==='number'||typeof value==='string'&&value.trim()!==''?Number(value):NaN;
const fail=():never=>{throw new ProposalLaunchSnapshotConflict('Принятая версия КП содержит неполный или несогласованный снимок численности и ставок. Проверьте принятую версию и согласуйте исправление; текущие позиции не подставлены автоматически.');};

// Legacy proposals can map role identity through their saved scenario IDs. Counts
// always come from the proposal and must agree with that scenario's saved inputs.
export function resolveProposalLaunchSnapshot(content:Record<string,unknown>,scenarioIds:string[],scenarios:ProposalLaunchScenario[]):ProposalLaunchRole[]{
  const roles=Array.isArray(content.roles)?content.roles:[];
  if(!roles.length||roles.length!==scenarioIds.length||scenarios.length!==scenarioIds.length||new Set(scenarioIds).size!==scenarioIds.length)fail();
  const byId=new Map(scenarios.map(s=>[s.id,s]));
  if(byId.size!==scenarios.length||scenarioIds.some(id=>!byId.has(id)))fail();
  const seen=new Set<string>(),seenRoles=new Set<string>();
  return roles.map(raw=>{
    const role=record(raw);if(!role||typeof role.scenarioId!=='string'||seen.has(role.scenarioId)||!scenarioIds.includes(role.scenarioId))return fail();
    seen.add(role.scenarioId);const scenario=byId.get(role.scenarioId)!;
    const count=numeric(role.count),workers=numeric(scenario.workers);
    if(!Number.isSafeInteger(count)||count<=0||!Number.isSafeInteger(workers)||workers!==count)fail();
    if(role.workers!==undefined&&numeric(role.workers)!==count)fail();
    if(!scenario.requestRoleId||!scenario.specialtyId||seenRoles.has(scenario.requestRoleId))fail();
    seenRoles.add(scenario.requestRoleId);
    if(role.requestRoleId!==undefined&&role.requestRoleId!==scenario.requestRoleId||role.specialtyId!==undefined&&role.specialtyId!==scenario.specialtyId)fail();
    const savedPricing=record(role.pricingSnapshot);
    if(savedPricing&&pricingKeys.some(key=>!(key in savedPricing)))fail();
    const pricingSource=savedPricing??scenario.pricing;
    const pricing=Object.fromEntries(pricingKeys.map(key=>[key,key==='scenarioId'?scenario.id:pricingSource[key]??null]));
    const amount=numeric(pricing.clientRateNet),unit=pricing.billingUnit;
    if(!Number.isFinite(amount)||amount<0||typeof unit!=='string'||!unit)fail();
    if(numeric(role.rateNet)!==amount||role.unit!==unit)fail();
    if(role.rateGross!==undefined&&pricing.clientRateGross!==null&&numeric(role.rateGross)!==numeric(pricing.clientRateGross))fail();
    if(savedPricing&&(numeric(scenario.pricing.clientRateNet)!==amount||scenario.pricing.billingUnit!==unit))fail();
    const legacyUnit=unit==='hour'?'hour':unit==='shift'?'shift':unit==='worker_month'||unit==='project_month'?'month':unit==='mixed'?pricing.variableBillingUnit==='hour'?'hour':pricing.variableBillingUnit==='shift'?'shift':'service':'service';
    return {scenarioId:scenario.id,requestRoleId:scenario.requestRoleId,specialtyId:scenario.specialtyId,count,amount,unit:legacyUnit,pricing};
  });
}
