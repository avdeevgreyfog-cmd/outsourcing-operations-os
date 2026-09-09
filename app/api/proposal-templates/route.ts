import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { createImportedProposalTemplate, listProposalTemplates } from "@/lib/commercial/proposal-template";

export const runtime = "nodejs";
const MAX_DOCX_BYTES=5*1024*1024;

export async function GET(){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    if(!actor.access.capabilities.includes("sales.proposal.read")&&!actor.access.capabilities.includes("admin.modules.manage"))throw new AccessDeniedError("sales.proposal.read");
    return NextResponse.json({templates:await listProposalTemplates(actor)});
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось загрузить шаблоны"},{status:500});
  }
}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"admin.modules.manage");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const form=await request.formData();const file=form.get("file");
    if(!(file instanceof File))return NextResponse.json({error:"Выберите DOCX-файл"},{status:400});
    if(!file.name.toLocaleLowerCase("ru-RU").endsWith(".docx"))return NextResponse.json({error:"Поддерживается загрузка шаблонов только в формате .docx"},{status:400});
    if(file.size<=0||file.size>MAX_DOCX_BYTES)return NextResponse.json({error:"Размер DOCX должен быть не больше 5 МБ"},{status:400});
    const requestedName=String(form.get("name")??"").trim();
    const name=(requestedName||file.name.replace(/\.docx$/i,"" )).slice(0,160);
    if(name.length<2)return NextResponse.json({error:"Укажите название шаблона"},{status:400});
    const docx=Buffer.from(await file.arrayBuffer());
    const created=await createImportedProposalTemplate(actor,{name,fileName:file.name,docx});
    return NextResponse.json(created,{status:201});
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось импортировать шаблон"},{status:400});
  }
}
