import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";

const schema=z.object({
  title:z.string().trim().min(3).max(300),customerName:z.string().trim().max(300).nullable().optional(),clientId:z.string().uuid().nullable().optional(),
  platform:z.string().trim().max(160).nullable().optional(),procedureNumber:z.string().trim().max(180).nullable().optional(),sourceUrl:z.string().url().max(2000).nullable().optional(),
  sourceName:z.string().trim().max(180).nullable().optional(),publicationDate:z.string().date().nullable().optional(),submissionDeadline:z.string().datetime({offset:true}).nullable().optional(),
  initialPrice:z.number().nonnegative().nullable().optional(),regionId:z.string().uuid().nullable().optional(),legalEntityId:z.string().uuid().nullable().optional(),comment:z.string().trim().max(4000).nullable().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.tender.create");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const body=schema.parse(await request.json());
    const created=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      if(body.clientId){const [client]=await tx`SELECT id FROM client_companies WHERE id=${body.clientId}::uuid`;if(!client)throw new Error("Выбранный клиент не найден");}
      if(body.regionId){const [region]=await tx`SELECT id FROM regions WHERE id=${body.regionId}::uuid`;if(!region)throw new Error("Выбранный регион не найден");}
      if(body.legalEntityId){const [entity]=await tx`SELECT id FROM legal_entities WHERE id=${body.legalEntityId}::uuid`;if(!entity)throw new Error("Юридическое лицо не найдено");}
      const [duplicate]=await tx<Array<{id:string;title:string}>>`
        SELECT id,title FROM tenders WHERE archived_at IS NULL AND (
          (${body.platform??null}::text IS NOT NULL AND ${body.procedureNumber??null}::text IS NOT NULL AND lower(platform)=lower(${body.platform??null}) AND lower(procedure_number)=lower(${body.procedureNumber??null}))
          OR (${body.sourceUrl??null}::text IS NOT NULL AND source_url=${body.sourceUrl??null})
        ) LIMIT 1
      `;
      if(duplicate)throw new Error(`Похожий тендер уже есть в базе: ${duplicate.title}`);
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO tenders(organization_id,client_company_id,legal_entity_id,title,customer_name,platform,procedure_number,source_url,source_name,publication_date,submission_deadline,initial_price,owner_user_id,created_by_user_id,assigned_team_id,region_id,next_action_text)
        VALUES(${actor.organizationId}::uuid,${body.clientId??null}::uuid,${body.legalEntityId??null}::uuid,${body.title},${body.customerName??null},${body.platform??null},${body.procedureNumber??null},${body.sourceUrl??null},${body.sourceName??"Ручной ввод"},${body.publicationDate??null}::date,${body.submissionDeadline??null}::timestamptz,${body.initialPrice??null},${actor.userId}::uuid,${actor.userId}::uuid,${actor.teamIds[0]??null}::uuid,${body.regionId??null}::uuid,'Изучить условия тендера') RETURNING id
      `;
      await tx`INSERT INTO tender_assignments(organization_id,tender_id,role_code,user_id,assigned_by_user_id) VALUES(${actor.organizationId}::uuid,${row.id}::uuid,'owner',${actor.userId}::uuid,${actor.userId}::uuid)`;
      if(body.comment)await tx`INSERT INTO comments(organization_id,entity_type,entity_id,body,created_by_user_id) VALUES(${actor.organizationId}::uuid,'tender',${row.id}::uuid,${body.comment},${actor.userId}::uuid)`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'tender',${row.id}::uuid,'created','Создан тендер')`;
      return row;
    }));
    return NextResponse.json(created,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные тендера",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
