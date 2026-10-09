import test from "node:test";
import assert from "node:assert/strict";
import {rankRateReferences} from "../lib/commercial/rate-selection.mjs";
const r=(id,regionId,sourceStatus,sourceDate,extra={})=>({
  id,regionId,sourceStatus,sourceDate,amountMin:350,amountMax:400,paySemantics:"net",sourceType:"manual",...extra,
});
test("rate ranking prefers same region and confirmed sources over later unverified imports",()=>{
  const ranked=rankRateReferences([
    r("actual","mo","actual","2026-06-01",{sourceType:"object"}),
    r("general",null,"historical","2026-10-01",{sourceType:"import"}),
    r("recent","mo","reference","2026-09-30"),
    r("future","mo","actual","2026-11-01"),
  ],"mo","2026-10-09");
  assert.deepEqual(ranked.map(item=>item.id),["actual","recent","general"]);
});
test("rate ranking does not convert payroll semantics or rate units",()=>{
  const item=r("shift",null,"reference","2026-09-01",{unit:"shift",paySemantics:"gross"});
  assert.equal(rankRateReferences([item],null,"2026-10-09")[0].paySemantics,"gross");
  assert.equal(rankRateReferences([item],null,"2026-10-09")[0].unit,"shift");
});
