import { spawn } from "node:child_process";

function run(command,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:"inherit",shell:process.platform==="win32"});
    child.on("error",reject);
    child.on("exit",(code,signal)=>{
      if(code===0)resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with code ${code ?? "null"}${signal?` signal ${signal}`:""}`));
    });
  });
}

await run(process.platform==="win32"?"npx.cmd":"npx",["next","build"]);

const shouldMigrate=process.env.VERCEL_ENV==="production" && Boolean(process.env.DATABASE_URL);
if(shouldMigrate){
  console.log("Production build passed. Applying pending database migrations...");
  await run(process.execPath,["scripts/migrate.mjs"]);
}else{
  console.log("Skipping production database migrations outside Vercel production.");
}
