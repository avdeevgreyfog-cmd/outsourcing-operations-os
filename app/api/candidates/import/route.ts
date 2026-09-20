import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const paramsSchema=z.object({
  needId:z.string().uuid().nullable().optional(),
  source:z.string().trim().max(240).default("База компании / импорт"),
  forceNameDuplicates:z.boolean().default(false),
  dryRun:z.boolean().default(true),
});

type ImportRow={
  row:number;fullName:string;phone:string;email:string;city:string;telegram:string;max:string;whatsapp:string;notes:string;
};
type Match={id:string;fullName:string;phone:string|null;email:string|null;reason:"phone"|"email"|"telegram"|"max"|"whatsapp"|"name"};

function cell(record:Record<string,unknown>,...names:string[]){
  for(const name of names){
    const value=record[name];
    if(value!==undefined&&value!==null&&String(value).trim())return String(value).trim();
  }
  return "";
}
function normalized(kind:string,value:string){
  if(kind==="phone"||kind==="whatsapp"||(kind==="max"&&value.trim().startsWith("+")))return value.replace(/\D/g,"");
  if(kind==="email")return value.trim().toLowerCase();
  if(kind==="telegram"||kind==="max")return value.trim().replace(/^@/,"").toLowerCase();
  return value.trim().toLowerCase();
}
function parseRows(buffer:ArrayBuffer):ImportRow[]{
  const book=XLSX.read(buffer,{type:"array"});
  const sheet=book.Sheets[book.SheetNames[0]];
  if(!sheet)return [];
  const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:""});
  return raw.map((record,index)=>({
    row:index+2,
    fullName:cell(record,"ФИО","Фамилия Имя Отчество","fullName","name"),
    phone:cell(record,"Телефон","phone"),
    email:cell(record,"Email","E-mail","email"),
    city:cell(record,"Город","city"),
    telegram:cell(record,"Telegram","telegram"),
    max:cell(record,"MAX","Max","max"),
    whatsapp:cell(record,"WhatsApp","Whatsapp","whatsapp"),
    notes:cell(record,"Комментарий","comment","notes"),
  })).filter(row=>row.fullName||row.phone||row.email||row.telegram||row.max||row.whatsapp);
}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.candidate.import");
    if(actor.demo)return NextResponse.json({error:"В GitHub Demo импорт обрабатывается локально в браузере"},{status:409});

    const form=await request.formData();
    const file=form.get("file");
    if(!(file instanceof File))return NextResponse.json({error:"Выберите Excel-файл"},{status:400});
    if(file.size>8*1024*1024)return NextResponse.json({error:"Файл слишком большой. Максимум 8 МБ"},{status:400});
    const params=paramsSchema.parse({
      needId:String(form.get("needId")||"")||null,
      source:String(form.get("source")||"База компании / импорт"),
      forceNameDuplicates:String(form.get("forceNameDuplicates")||"false")==="true",
      dryRun:String(form.get("dryRun")??"true")==="true",
    });
    const rows=parseRows(await file.arrayBuffer());
    if(!rows.length)return NextResponse.json({error:"В файле нет строк кандидатов"},{status:400});
    if(rows.length>2000)return NextResponse.json({error:"За одну загрузку можно импортировать до 2000 кандидатов"},{status:400});

    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let need:null|{id:string;objectId:string|null;regionId:string|null;clientId:string|null;ownerUserId:string|null;managerUserId:string|null;conditions:Record<string,unknown>;assigneeUserIds:string[]}=null;
      if(params.needId){
        const [found]=await tx<Array<typeof need extends infer T ? Exclude<T,null> : never>>\`
          SELECT n.id,n.object_id "objectId",COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
            n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",n.conditions_snapshot conditions,
            ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=n.id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
              || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=n.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
          FROM needs n LEFT JOIN objects o ON o.id=n.object_id
          WHERE n.id=\${params.needId}::uuid AND n.status IN ('open','in_progress')
        \`;
        if(!found)throw new Error("Потребность не найдена или уже закрыта");
        if(!canReadRow(actor.access,"recruiting.candidate.create",found,actor))throw new AccessDeniedError("recruiting.candidate.create");
        need=found;
      }

      const preview:Array<Record<string,unknown>>=[];
      let created=0,linked=0,existing=0,skipped=0,errors=0;
      for(const row of rows){
        if(!row.fullName||(!row.phone&&!row.email&&!row.telegram&&!row.max&&!row.whatsapp)){
          preview.push({...row,status:"error",message:"Нужны ФИО и хотя бы один контакт"});errors++;continue;
        }
        const probes=[
          ["phone",row.phone],["email",row.email],["telegram",row.telegram],["max",row.max],["whatsapp",row.whatsapp]
        ].filter(([,value])=>Boolean(value)) as Array<[string,string]>;
        let strong:Match|null=null;
        for(const [kind,value] of probes){
          const norm=normalized(kind,value);
          const [match]=await tx<Array<Match>>\`
            SELECT c.id,c.full_name "fullName",c.phone,c.email,\${kind}::text reason
            FROM candidates c
            WHERE c.organization_id=\${actor.organizationId}::uuid
              AND (
                (\${kind}='phone' AND regexp_replace(COALESCE(c.phone,''),'\\D','','g')=\${norm})
                OR (\${kind}='email' AND lower(COALESCE(c.email,''))=\${norm})
                OR EXISTS(SELECT 1 FROM candidate_contacts cc WHERE cc.candidate_id=c.id AND cc.kind=\${kind} AND cc.normalized_value=\${norm})
              )
            ORDER BY c.updated_at DESC LIMIT 1
          \`;
          if(match){strong=match;break;}
        }
        const [nameMatch]=!strong?await tx<Array<Match>>\`
          SELECT c.id,c.full_name "fullName",c.phone,c.email,'name'::text reason
          FROM candidates c
          WHERE c.organization_id=\${actor.organizationId}::uuid AND lower(btrim(c.full_name))=lower(btrim(\${row.fullName}))
          ORDER BY c.updated_at DESC LIMIT 1
        \`:[];

        if(params.dryRun){
          const match=strong??nameMatch??null;
          preview.push({...row,status:strong?"existing":nameMatch?"possible_duplicate":"new",match});
          continue;
        }
        if(nameMatch&&!strong&&!params.forceNameDuplicates){
          preview.push({...row,status:"skipped",message:"Совпадает ФИО — требуется ручная проверка",match:nameMatch});skipped++;continue;
        }

        let candidateId=strong?.id??null;
        if(!candidateId){
          const [candidate]=await tx<Array<{id:string}>>\`
            INSERT INTO candidates(organization_id,full_name,phone,email,preferred_channel,telegram,whatsapp,city,source,source_channel,notes,
              original_recruiter_user_id,current_recruiter_user_id,created_by_user_id,status)
            VALUES(\${actor.organizationId}::uuid,\${row.fullName},\${row.phone||null},\${row.email||null},
              \${row.telegram?"telegram":row.max?"max":row.whatsapp?"whatsapp":row.phone?"phone":row.email?"email":null},
              \${row.telegram||null},\${row.whatsapp||null},\${row.city||null},\${params.source},'Импорт Excel',\${row.notes||null},
              \${actor.userId}::uuid,\${actor.userId}::uuid,\${actor.userId}::uuid,'active')
            RETURNING id
          \`;
          candidateId=candidate.id;created++;
          const contacts=[
            ["phone",row.phone],["email",row.email],["telegram",row.telegram],["max",row.max],["whatsapp",row.whatsapp]
          ].filter(([,value])=>Boolean(value)) as Array<[string,string]>;
          let first=true;
          for(const [kind,value] of contacts){
            await tx\`
              INSERT INTO candidate_contacts(organization_id,candidate_id,kind,value,is_primary,is_preferred,normalized_value,created_by_user_id)
              VALUES(\${actor.organizationId}::uuid,\${candidateId}::uuid,\${kind},\${value},true,\${first},\${normalized(kind,value)},\${actor.userId}::uuid)
              ON CONFLICT DO NOTHING
            \`;
            first=false;
          }
        }else existing++;

        let applicationId:string|null=null;
        if(need){
          const [old]=await tx<Array<{id:string}>>\`SELECT id FROM candidate_applications WHERE candidate_id=\${candidateId}::uuid AND need_id=\${need.id}::uuid\`;
          if(old)applicationId=old.id;
          else{
            const [app]=await tx<Array<{id:string}>>\`
              INSERT INTO candidate_applications(organization_id,candidate_id,need_id,object_id,stage,owner_user_id,manager_user_id,conditions_snapshot,source_snapshot,created_by_user_id)
              VALUES(\${actor.organizationId}::uuid,\${candidateId}::uuid,\${need.id}::uuid,\${need.objectId}::uuid,'new',
                \${need.ownerUserId??actor.userId}::uuid,\${need.managerUserId}::uuid,\${tx.json(need.conditions??{})},
                \${tx.json({source:params.source,channel:"Импорт Excel",campaign:null,reference:null})},\${actor.userId}::uuid)
              RETURNING id
            \`;
            applicationId=app.id;linked++;
            await tx\`
              INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,reason,changed_by_user_id)
              VALUES(\${actor.organizationId}::uuid,\${app.id}::uuid,NULL,'new','Импортирован из базы компании',\${actor.userId}::uuid)
            \`;
          }
        }
        preview.push({...row,status:strong?"existing":"created",candidateId,applicationId});
      }
      if(!params.dryRun){
        await tx\`
          INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(\${actor.organizationId}::uuid,\${actor.userId}::uuid,'organization',\${actor.organizationId}::uuid,'candidate_import',
            \${\`Импорт кандидатов: \${created} новых, \${existing} найдено в базе\`},
            \${tx.json({rows:rows.length,created,existing,linked,skipped,errors,needId:need?.id??null})})
        \`;
      }
      return {rows:preview,summary:{total:rows.length,created,existing,linked,skipped,errors}};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры импорта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось импортировать кандидатов"},{status:500});
  }
}
