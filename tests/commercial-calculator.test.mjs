import test from "node:test";
import assert from "node:assert/strict";
import {calculateCommercialScenario} from "../lib/core/commercial-calculator.mjs";

test("target margin derives client price without VAT and with VAT",()=>{
 const result=calculateCommercialScenario({workerNetHourly:400,workers:10,hoursPerWorker:200,mandatoryChargePct:25,employeeCosts:[],projectCosts:[],targetMarginPct:20,vatRatePct:20,priceMode:"target_margin"});
 assert.equal(result.totalCostHourly,500);
 assert.equal(result.clientRateExVat,625);
 assert.equal(result.clientRateWithVat,750);
 assert.equal(result.marginPct,20);
 assert.equal(result.monthlyContribution,250000);
});

test("client limit with VAT is normalized before margin calculation",()=>{
 const result=calculateCommercialScenario({workerNetHourly:400,workers:1,hoursPerWorker:200,mandatoryChargePct:0,employeeCosts:[],projectCosts:[],priceMode:"client_limit",clientRate:600,clientRateIncludesVat:true,vatRatePct:20,recommendedMarginPct:18,minimumMarginPct:15});
 assert.equal(result.clientRateExVat,500);
 assert.equal(result.clientRateWithVat,600);
 assert.equal(result.marginPct,20);
 assert.equal(result.marginDeviationPct,2);
 assert.equal(result.belowMinimumMargin,false);
});

test("employment model rule changes economics through mandatory charge percentage",()=>{
 const low=calculateCommercialScenario({workerNetHourly:400,workers:1,hoursPerWorker:200,mandatoryChargePct:6,employeeCosts:[],projectCosts:[],targetMarginPct:18,vatRatePct:0});
 const high=calculateCommercialScenario({workerNetHourly:400,workers:1,hoursPerWorker:200,mandatoryChargePct:30,employeeCosts:[],projectCosts:[],targetMarginPct:18,vatRatePct:0});
 assert.ok(high.totalCostHourly>low.totalCostHourly);
 assert.ok(high.clientRateExVat>low.clientRateExVat);
});

test("project monthly costs are distributed across project hours",()=>{
 const result=calculateCommercialScenario({workerNetHourly:300,workers:10,hoursPerWorker:200,mandatoryChargePct:0,employeeCosts:[],projectCosts:[{enabled:true,hourlyAmount:100000}],targetMarginPct:0,vatRatePct:0});
 // projectCosts are supplied as monthly totals to this engine.
 assert.equal(result.projectCostsMonthly,100000);
 assert.equal(result.projectCostsHourly,50);
 assert.equal(result.totalCostHourly,350);
});
