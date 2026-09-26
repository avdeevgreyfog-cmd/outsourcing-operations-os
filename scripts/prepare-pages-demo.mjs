import fs from "node:fs";

const routes = {
  "app/(workspace)/calculations/[id]/page.tsx": "calculations",
  "app/(workspace)/candidates/[id]/page.tsx": "candidates",
  "app/(workspace)/clients/[id]/page.tsx": "clients",
  "app/(workspace)/contracts/[id]/page.tsx": "contracts",
  "app/(workspace)/objects/[id]/page.tsx": "objects",
  "app/(workspace)/proposals/[id]/page.tsx": "proposals",
  "app/(workspace)/requests/[id]/page.tsx": "requests",
  "app/(workspace)/tenders/[id]/page.tsx": "tenders",
  "app/(workspace)/workers/[id]/page.tsx": "workers",
};

for (const [path,key] of Object.entries(routes)) {
  let source = fs.readFileSync(path,"utf8");
  if (source.includes("export function generateStaticParams")) continue;
  if (!source.includes('from "@/lib/demo/static-params"')) {
    source = 'import { githubPagesStaticParams } from "@/lib/demo/static-params";\n' + source;
  }
  const marker = "export default async function";
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Default page export not found: ${path}`);
  const helper = `export function generateStaticParams(){\n  return githubPagesStaticParams.${key}.map((id)=>({id}));\n}\n\n`;
  source = source.slice(0,index) + helper + source.slice(index);
  fs.writeFileSync(path,source);
}

for (const path of ["app/demo","app/work"]) {
  fs.rmSync(path,{recursive:true,force:true});
}

console.log("GitHub Pages static detail params prepared.");
