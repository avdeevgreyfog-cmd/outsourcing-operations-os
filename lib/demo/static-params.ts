import * as demo from "@/lib/demo/data";
import { flattenNavigation } from "@/lib/core/navigation.mjs";

const ids = <T extends {id:string}>(rows:T[]) => rows.map((row)=>row.id);

export const githubPagesStaticParams = {
  clients: ids(demo.clients),
  requests: ids(demo.requests),
  calculations: [...new Set(demo.calculations.map((row)=>row.requestId))],
  objects: ids(demo.objects),
  candidates: ids(demo.candidates),
  workers: ids(demo.workers),
  proposals: ids(demo.proposals),
  tenders: [
    "a1000000-0000-4000-8000-000000000001",
    "a1000000-0000-4000-8000-000000000002",
    "a1000000-0000-4000-8000-000000000003",
    "a1000000-0000-4000-8000-000000000004",
  ],
  contracts: ["8f000000-0000-4000-8000-000000000001"],
  foundation: flattenNavigation()
    .filter((item)=>item.status==="foundation")
    .map((item)=>item.href.split("?")[0].split("/").filter(Boolean)),
};
