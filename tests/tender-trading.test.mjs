import assert from "node:assert/strict";
import test from "node:test";
import {buildTenderBidEconomics} from "../lib/tenders/trading.mjs";

test("tender bid economics calculates margin only from comparable approved scenario snapshots",()=>{
  const snapshot=buildTenderBidEconomics({
    bidValue:12000,
    priceVatMode:"with_vat",
    roles:[
      {roleId:"1",roleTitle:"Комплектовщик",volume:100,roleBillingUnit:"hour",scenarioId:"s1",calculationId:"c1",calculationVersion:2,scenarioVersion:3,scenarioBillingUnit:"hour",costPerBillingUnit:50,vatPct:20},
      {roleId:"2",roleTitle:"Грузчик",volume:50,roleBillingUnit:"hour",scenarioId:"s2",calculationId:"c1",calculationVersion:2,scenarioVersion:1,scenarioBillingUnit:"hour",costPerBillingUnit:40,vatPct:20},
    ],
  });
  assert.equal(snapshot.status,"complete");
  assert.equal(snapshot.revenueNet,10000);
  assert.equal(snapshot.totalCostNet,7000);
  assert.equal(snapshot.marginPct,30);
  assert.equal(snapshot.vatPct,20);
  assert.deepEqual(snapshot.missing,[]);
  assert.deepEqual(snapshot.sources.map(item=>item.scenarioId),["s1","s2"]);
});

test("tender bid economics does not fabricate margin when source economics are incomplete",()=>{
  const snapshot=buildTenderBidEconomics({
    bidValue:9500,
    priceVatMode:"unknown",
    roles:[
      {roleId:"1",roleTitle:"Комплектовщик",volume:null,roleBillingUnit:"hour",scenarioId:null,calculationId:null,scenarioBillingUnit:null,costPerBillingUnit:null,vatPct:null},
    ],
  });
  assert.equal(snapshot.status,"incomplete");
  assert.equal(snapshot.revenueNet,null);
  assert.equal(snapshot.totalCostNet,null);
  assert.equal(snapshot.marginPct,null);
  assert.ok(snapshot.missing.some(item=>item.includes("режим НДС")));
  assert.ok(snapshot.missing.some(item=>item.includes("Нет принятого сценария")));
});

test("mixed or mismatched tariff units keep margin unavailable",()=>{
  const snapshot=buildTenderBidEconomics({
    bidValue:100000,
    priceVatMode:"without_vat",
    roles:[
      {roleId:"1",roleTitle:"Смешанная позиция",volume:100,roleBillingUnit:"mixed",scenarioId:"s1",calculationId:"c1",calculationVersion:1,scenarioVersion:1,scenarioBillingUnit:"mixed",costPerBillingUnit:500,vatPct:20},
    ],
  });
  assert.equal(snapshot.status,"incomplete");
  assert.equal(snapshot.marginPct,null);
  assert.ok(snapshot.missing.some(item=>item.includes("Смешанная тарификация")));
});
