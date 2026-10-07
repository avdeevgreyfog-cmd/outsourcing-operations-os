import test from "node:test";
import assert from "node:assert/strict";
import {validateTenderLaunchPricing} from "../lib/tenders/handoff.mjs";

function role(overrides={}){
  return {
    title:"Комплектовщик",
    volume:100,
    roleBillingUnit:"hour",
    scenarioBillingUnit:"hour",
    billingUnit:"hour",
    clientRateNet:700,
    vatPct:20,
    ...overrides,
  };
}

test("tender launch pricing accepts final net rates aligned with winning bid",()=>{
  const result=validateTenderLaunchPricing({
    bidValue:70000,
    priceVatMode:"without_vat",
    roles:[role()],
  });
  assert.equal(result.status,"aligned");
  assert.equal(result.winningRevenueNet,70000);
  assert.equal(result.scenarioRevenueNet,70000);
  assert.equal(result.differenceNet,0);
});

test("tender launch pricing converts VAT-inclusive winning price to net before comparison",()=>{
  const result=validateTenderLaunchPricing({
    bidValue:84000,
    priceVatMode:"with_vat",
    roles:[role()],
  });
  assert.equal(result.status,"aligned");
  assert.equal(result.winningRevenueNet,70000);
  assert.equal(result.vatPct,20);
});

test("tender launch pricing blocks stale accepted rates after auction reduction",()=>{
  const result=validateTenderLaunchPricing({
    bidValue:65000,
    priceVatMode:"without_vat",
    roles:[role()],
  });
  assert.equal(result.status,"mismatch");
  assert.equal(result.differenceNet,5000);
  assert.match(result.missing.join(" "),/не совпадают с ценой победы/i);
});

test("tender launch pricing blocks ambiguous units, missing volume and inconsistent VAT",()=>{
  const ambiguous=validateTenderLaunchPricing({
    bidValue:70000,
    priceVatMode:"without_vat",
    roles:[role({roleBillingUnit:"mixed",scenarioBillingUnit:"mixed"})],
  });
  assert.equal(ambiguous.status,"mismatch");
  assert.match(ambiguous.missing.join(" "),/тарификац/i);

  const noVolume=validateTenderLaunchPricing({
    bidValue:70000,
    priceVatMode:"without_vat",
    roles:[role({volume:null})],
  });
  assert.equal(noVolume.status,"mismatch");
  assert.match(noVolume.missing.join(" "),/объём/i);

  const vatMismatch=validateTenderLaunchPricing({
    bidValue:168000,
    priceVatMode:"with_vat",
    roles:[role(),role({title:"Грузчик",vatPct:10})],
  });
  assert.equal(vatMismatch.status,"mismatch");
  assert.match(vatMismatch.missing.join(" "),/разные ставки НДС/i);
});
