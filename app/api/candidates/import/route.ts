import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const rowSchema=z.object({
  fullName:z.string().trim().min(2).max(240),
  phone:z.string().trim().max(60).nullable().optional(),
  email:z.string().email().nullable().optional(),
  city:z.string().trim().max(240).nullable().optional(),
  telegram:z.string().trim().max(120).nullable().optional(),
  whatsapp:z.string().trim().max(120).nullable().optional(),
  max:z.string().trim().max(120).nullable().optional(),
  preferredChannel:z.enum(["phone","email","telegram","whatsapp","max","other"]).nullable().optional(),
});
const schema=z.object({
  rows:z.array(rowSchema).min(1).max(1000),
  needId:z.string().uuid().nullable().optional(),
  source:z.string().trim().max(240).default("База компании / импорт"),
  ownerUserId:z.string().uuid().nullable().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.create");
    if(actor.demo)return NextResponse.json({error:"В GitHub Demo импорт выполняется локально в браузере"},{status:409});
    const body=schema.parse(await request.json());

    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      if(body.ownerUserId){
        const [member]=await tx<Array<{id:string}>>`
          SELECT user_id id FROM organization_memberships
          WHERE organization_id=${actor.organizationId}::uuid AND user_id=${body.ownerUserId}::uuid AND status='active'
        `;
        if(!member)throw new Error("Ответственный не является активным сотрудником организации");
      }

      let need:null|{id:string;objectId:string|null;ownerUserId:string|null;managerUserId:string|null;conditions:Record<string,unknown>;regionId:string|null;clientId:string|null;assigneeUserIds:string[]}=null;
      if(body.needId){
        [need]=await tx<Array<{id:string;objectId:string|null;ownerUserId:string|null;managerUserId:string|null;conditions:Record<string,unknown>;regionId:string|null;clientId:string|null;assigneeUserIds:string[]}>>`
          SELECT n.id,n.object_id "objectId",COALESCE(n.owner_user_id,${body.ownerUserId??null}::uuid) "ownerUserId",n.manager_user_id "managerUserId",
            n.conditions_snapshot conditions,COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
            ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=n.id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
              || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=n.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
          FROM needs n LEFT JOIN objects o ON o.id=n.object_id
          WHERE n.id=${body.needId}::uuid AND n.status IN ('open','in_progress')
        `;
        if(!need)throw new Error("Потребность не найдена или закрыта");
        if(!canReadRow(actor.access,"recruiting.candidate.create",need,actor))throw new AccessDeniedError("recruiting.candidate.create");
      }

      let created=0,reused=0,applications=0,duplicateApplications=0;
      const issues:Array<{row:number;type:string;candidateId?:string;message:string}>=[];
      for(let index=0;index<body.rows.length;index++){
        const row=body.rows[index];
        if(!row.phone&&!row.email&&!row.telegram&&!row.whatsapp&&!row.max){
          issues.push({row:index+2,type:"invalid",message:"Нет ни одного контакта"});continue;
        }
        const contacts=[
          ...(row.phone?[{channel:"phone",value:row.phone}]:[]),
          ...(row.email?[{channel:"email",value:row.email}]:[]),
          ...(row.telegram?[{channel:"telegram",value:row.telegram}]:[]),
          ...(row.whatsapp?[{channel:"whatsapp",value:row.whatsapp}]:[]),
          ...(row.max?[{channel:"max",value:row.max}]:[]),
        ];
        const [existing]=await tx<Array<{id:string}>>`
          SELECT DISTINCT c.id FROM candidates c
          LEFT JOIN candidate_contact_methods cm ON cm.candidate_id=c.id AND cm.active
          WHERE (${row.phone??null} IS NOT NULL AND regexp_replace(COALESCE(c.phone,''),'\\\\D','','g')=regexp_replace(${row.phone??''},'\\\\D','','g'))
             OR (${row.email??null} IS NOT NULL AND lower(COALESCE(c.email,''))=lower(${row.email??''}))
             OR EXISTS(
               SELECT 1 FROM jsonb_to_recordset(${tx.json(contacts)}::jsonb) x(channel text,value text)
               WHERE cm.channel=x.channel AND (
                 (x.channel IN ('phone','whatsapp','max') AND regexp_replace(cm.value,'\\\\D','','g')=regexp_replace(x.value,'\\\\D','','g'))
                 OR (x.channel NOT IN ('phone','whatsapp','max') AND lower(cm.value)=lower(x.value))
               )
             )
          LIMIT 1
        `;
        let candidateId=existing?.id;
        if(candidateId){
          reused++;
          if(body.ownerUserId){
            await tx`
              UPDATE candidates SET
                current_recruiter_user_id=${body.ownerUserId}::uuid,
                updated_at=now()
              WHERE id=${candidateId}::uuid
            `;
          }
        }else{
          const [candidate]=await tx<Array<{id:string}>>`
            INSERT INTO candidates(organization_id,full_name,phone,email,preferred_channel,telegram,whatsapp,city,source,source_channel,original_recruiter_user_id,current_recruiter_user_id,created_by_user_id,status)
            VALUES(${actor.organizationId}::uuid,${row.fullName},${row.phone??null},${row.email??null},${row.preferredChannel??(row.telegram?"telegram":row.whatsapp?"whatsapp":row.max?"max":"phone")},${row.telegram??null},${row.whatsapp??null},${row.city??null},${body.source},'Импорт базы',NULL,${body.ownerUserId??null}::uuid,${actor.userId}::uuid,'active')
            RETURNING id
          `;
          candidateId=candidate.id;created++;
        }
        for(const contact of contacts){
          await tx`
            INSERT INTO candidate_contact_methods(organization_id,candidate_id,channel,value,is_preferred,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${candidateId}::uuid,${contact.channel},${contact.value},${row.preferredChannel===contact.channel},${actor.userId}::uuid)
            ON CONFLICT(candidate_id,channel,value) DO UPDATE SET active=true,is_preferred=EXCLUDED.is_preferred,updated_at=now()
          `;
        }
        if(need){
          const [duplicate]=await tx<Array<{id:string}>>`SELECT id FROM candidate_applications WHERE candidate_id=${candidateId}::uuid AND need_id=${need.id}::uuid`;
          if(duplicate){duplicateApplications++;issues.push({row:index+2,type:"duplicate_application",candidateId,message:"Заявка на эту потребность уже существует"});}
          else{
            const conditionSnapshot=JSON.parse(JSON.stringify(need.conditions??{}));
            const [app]=await tx<Array<{id:string}>>`
              INSERT INTO candidate_applications(organization_id,candidate_id,need_id,object_id,stage,owner_user_id,manager_user_id,conditions_snapshot,source_snapshot,created_by_user_id)
              VALUES(${actor.organizationId}::uuid,${candidateId}::uuid,${need.id}::uuid,${need.objectId}::uuid,'new',${body.ownerUserId??null}::uuid,${need.managerUserId}::uuid,${tx.json(conditionSnapshot)},${tx.json({source:body.source,channel:"Импорт базы",campaign:null,reference:null})},${actor.userId}::uuid)
              RETURNING id
            `;
            await tx`
              INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,reason,changed_by_user_id)
              VALUES(${actor.organizationId}::uuid,${app.id}::uuid,NULL,'new','Массовая загрузка кандидатов',${actor.userId}::uuid)
            `;
            applications++;
          }
        }
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate_import','bulk_import',
          ${`Импортировано кандидатов: ${body.rows.length}`},
          ${tx.json({rows:body.rows.length,created,reused,applications,duplicateApplications,needId:body.needId??null,source:body.source})})
      `;
      return {total:body.rows.length,created,reused,applications,duplicateApplications,issues};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте строки импорта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось импортировать кандидатов"},{status:500});
  }
}
