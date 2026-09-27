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

// Builds must be side-effect free. Database migrations are a separate release step.
await run(process.platform==="win32"?"npx.cmd":"npx",["next","build"]);
console.log("Build complete. Database migrations were not executed.");
