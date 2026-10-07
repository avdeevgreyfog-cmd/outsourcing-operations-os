export function buildTenderBidEconomics({bidValue,priceVatMode,roles}) {
  const amount=Number(bidValue);
  const missing=[];
  const sources=[];
  if(!Number.isFinite(amount)||amount<=0)missing.push("Цена торгов должна быть больше нуля");
  if(!["with_vat","without_vat","not_applicable"].includes(priceVatMode))missing.push("Не указан режим НДС цены торгов");
  if(!Array.isArray(roles)||roles.length===0)missing.push("Не заданы позиции тендера");

  let knownCost=0;
  for(const role of roles??[]){
    const roleName=String(role.roleTitle??"Позиция");
    const volume=numberOrNull(role.volume);
    const cost=numberOrNull(role.costPerBillingUnit);
    const roleUnit=String(role.roleBillingUnit??"unknown");
    const scenarioUnit=String(role.scenarioBillingUnit??"unknown");
    const vatPct=numberOrNull(role.vatPct);
    if(!role.scenarioId){
      missing.push(`Нет принятого сценария утверждённого расчёта: «${roleName}»`);
      continue;
    }
    sources.push({
      roleId:String(role.roleId),
      scenarioId:String(role.scenarioId),
      calculationId:String(role.calculationId),
      calculationVersion:Number(role.calculationVersion??1),
      scenarioVersion:Number(role.scenarioVersion??1),
      billingUnit:scenarioUnit,
      volume,
      costPerBillingUnit:cost,
      vatPct,
    });
    if(volume==null||volume<=0)missing.push(`Не указан объём позиции «${roleName}»`);
    if(cost==null||cost<0)missing.push(`Нет себестоимости по позиции «${roleName}»`);
    if(roleUnit==="unknown"||scenarioUnit==="unknown"||roleUnit!==scenarioUnit)missing.push(`Единица расчёта не совпадает с объёмом позиции «${roleName}»`);
    if(roleUnit==="mixed"||scenarioUnit==="mixed")missing.push(`Смешанная тарификация позиции «${roleName}» требует отдельного расчёта общей стоимости`);
    if(volume!=null&&volume>0&&cost!=null&&cost>=0&&roleUnit===scenarioUnit&&roleUnit!=="unknown"&&roleUnit!=="mixed")knownCost+=volume*cost;
  }

  let vatPct=null;
  if(priceVatMode==="with_vat"){
    const vatValues=sources.map(source=>source.vatPct).filter(value=>value!=null);
    if(vatValues.length!==roles.length)missing.push("Не во всех утверждённых сценариях зафиксирован НДС");
    const unique=[...new Set(vatValues.map(value=>round(Number(value),4)))];
    if(unique.length!==1)missing.push("В утверждённых сценариях используются разные ставки НДС");
    else vatPct=unique[0];
  }else if(priceVatMode==="not_applicable"){
    vatPct=0;
  }

  const complete=missing.length===0;
  const revenueNet=complete
    ? priceVatMode==="with_vat"
      ? amount/(1+Number(vatPct)/100)
      : amount
    : null;
  const totalCostNet=complete?knownCost:null;
  const marginPct=complete&&revenueNet&&revenueNet>0?(revenueNet-knownCost)/revenueNet*100:null;
  return {
    status:complete?"complete":"incomplete",
    revenueNet:revenueNet==null?null:round(revenueNet,2),
    totalCostNet:totalCostNet==null?null:round(totalCostNet,2),
    marginPct:marginPct==null?null:round(marginPct,2),
    vatPct,
    missing:[...new Set(missing)],
    sources,
  };
}

export async function calculateTenderBidEconomics(sql,tenderId,bidValue,priceVatMode){
  const roles=await sql`
    WITH approved_calc AS (
      SELECT id,version
      FROM calculations
      WHERE tender_id=${tenderId}::uuid AND status='approved'
      ORDER BY version DESC,created_at DESC
      LIMIT 1
    )
    SELECT tr.id "roleId",tr.title "roleTitle",tr.volume,tr.billing_unit "roleBillingUnit",
      accepted."scenarioId",accepted."calculationId",accepted."calculationVersion",accepted."scenarioVersion",
      accepted."scenarioBillingUnit",accepted."costPerBillingUnit",accepted."vatPct"
    FROM tender_roles tr
    LEFT JOIN approved_calc ac ON true
    LEFT JOIN LATERAL (
      SELECT cs.id "scenarioId",ac.id "calculationId",ac.version "calculationVersion",cs.version "scenarioVersion",
        cs.result_snapshot->>'billingUnit' "scenarioBillingUnit",
        (cs.result_snapshot->>'costPerBillingUnit')::numeric "costPerBillingUnit",
        (cs.result_snapshot->>'vatPct')::numeric "vatPct"
      FROM calculation_scenarios cs
      WHERE cs.calculation_id=ac.id
        AND cs.tender_role_id=tr.id
        AND cs.status='accepted'
      ORDER BY cs.version DESC,cs.created_at DESC
      LIMIT 1
    ) accepted ON true
    WHERE tr.tender_id=${tenderId}::uuid
    ORDER BY tr.created_at
  `;
  return buildTenderBidEconomics({bidValue,priceVatMode,roles});
}

function numberOrNull(value){
  if(value===null||value===undefined||value==="")return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function round(value,digits=2){
  const factor=10**digits;
  return Math.round((Number(value)+Number.EPSILON)*factor)/factor;
}
