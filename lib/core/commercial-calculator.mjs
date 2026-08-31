export function calculateCommercialScenario(input) {
  const workers=Math.max(1,number(input.workers,1));
  const hoursPerWorker=Math.max(1,number(input.hoursPerWorker,1));
  const workerNetHourly=Math.max(0,number(input.workerNetHourly,0));
  const mandatoryChargePct=clamp(number(input.mandatoryChargePct,0),0,500);
  const mandatoryChargesHourly=workerNetHourly*mandatoryChargePct/100;
  const employeeCostsHourly=sumEnabled(input.employeeCosts);
  const projectCostsMonthly=sumEnabled(input.projectCosts);
  const projectCostsHourly=projectCostsMonthly/(workers*hoursPerWorker);
  const totalCostHourly=workerNetHourly+mandatoryChargesHourly+employeeCostsHourly+projectCostsHourly;
  const vatRatePct=Math.max(0,number(input.vatRatePct,0));
  const vatMultiplier=1+vatRatePct/100;
  const priceMode=input.priceMode==="client_limit"?"client_limit":"target_margin";
  const targetMarginPct=clamp(number(input.targetMarginPct,15),0,95);

  let clientRateExVat;
  if(priceMode==="client_limit"){
    const entered=Math.max(0,number(input.clientRate,0));
    clientRateExVat=input.clientRateIncludesVat?entered/vatMultiplier:entered;
  }else{
    clientRateExVat=totalCostHourly/(1-targetMarginPct/100);
  }
  const vatHourly=clientRateExVat*vatRatePct/100;
  const clientRateWithVat=clientRateExVat+vatHourly;
  const profitHourly=clientRateExVat-totalCostHourly;
  const marginPct=clientRateExVat===0?0:profitHourly/clientRateExVat*100;
  const recommendedMarginPct=number(input.recommendedMarginPct,0);
  const minimumMarginPct=number(input.minimumMarginPct,0);

  let exceedsLimitBy=0;
  if(input.maxClientRate!=null){
    const maxEntered=Math.max(0,number(input.maxClientRate,0));
    const actual=input.maxClientRateIncludesVat===false?clientRateExVat:clientRateWithVat;
    exceedsLimitBy=Math.max(0,actual-maxEntered);
  }

  return {
    workerNetHourly:money(workerNetHourly),
    mandatoryChargesHourly:money(mandatoryChargesHourly),
    employeeCostsHourly:money(employeeCostsHourly),
    projectCostsHourly:money(projectCostsHourly),
    projectCostsMonthly:money(projectCostsMonthly),
    totalCostHourly:money(totalCostHourly),
    clientRateHourly:money(clientRateExVat),
    clientRateExVat:money(clientRateExVat),
    vatHourly:money(vatHourly),
    clientRateWithVat:money(clientRateWithVat),
    profitHourly:money(profitHourly),
    marginHourly:money(profitHourly),
    marginPct:money(marginPct),
    targetMarginPct:money(targetMarginPct),
    recommendedMarginPct:money(recommendedMarginPct),
    minimumMarginPct:money(minimumMarginPct),
    marginDeviationPct:money(marginPct-recommendedMarginPct),
    belowMinimumMargin:marginPct<minimumMarginPct,
    exceedsLimitBy:money(exceedsLimitBy),
    monthlyRevenue:money(clientRateExVat*hoursPerWorker*workers),
    monthlyRevenueWithVat:money(clientRateWithVat*hoursPerWorker*workers),
    monthlyCost:money(totalCostHourly*hoursPerWorker*workers),
    monthlyContribution:money(profitHourly*hoursPerWorker*workers),
    projectEconomics:{workers,hoursPerWorker,totalHours:money(workers*hoursPerWorker)},
  };
}

export function normalizeCost(amount,base,{hoursPerWorker=1,shiftHours=1}={}){
  const value=Math.max(0,number(amount,0));
  if(base==="per_shift")return value/Math.max(1,number(shiftHours,1));
  if(base==="per_worker_month")return value/Math.max(1,number(hoursPerWorker,1));
  return value;
}

export function sumEnabled(items=[]){return items.filter((item)=>item.enabled!==false).reduce((sum,item)=>sum+number(item.hourlyAmount??item.amount,0),0);}
function money(value){return Math.round((value+Number.EPSILON)*100)/100;}
function number(value,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
