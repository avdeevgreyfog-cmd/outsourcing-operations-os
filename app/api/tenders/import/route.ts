import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";

const rowSchema=z.object({
  title:z.string().trim().min(2).max(300),customerName:z.string().trim().max(300).nullable().optional(),platform:z.string().trim().max(160).nullable().optional(),procedureNumber:z.string().trim().max(180).nullable().optional(),sourceUrl:z.string().url().max(2000).nullable().optional(),sourceName:z.string().trim().max(180).nullable().optional(),publicationDate:z.string().date().nullable().optional(),submissionDeadline:z.string().datetime({offset:true}).nullable().optional(),initialPrice:z.number().nonnegative().nullable().optional(),comment:z.string().trim().max(4000).nullable().optional(),
});
const schema=z.object({rows:z.array(rowSchema).min(1).max(500)});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.tender.import");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const imported:Array<{index:number;id:string;title:string}>=[];const skipped:Array<{index:number;title:string;reason:string;existingId?:string}>=[];
      for(let index=0;index<body.rows.length;index++){
        const item=body.rows[index];
        const [duplicate]=await tx<Array<{id:string;title:string}>>`
          SELECT id,title FROM tenders WHERE archived_at IS NULL AND (
            (${item.platform??null}::text IS NOT NULL AND ${item.procedureNumber??null}::text IS NOT NULL AND lower(platform)=lower(${item.platform??null}) AND lower(procedure_number)=lower(${item.procedureNumber??null}))
            OR (${item.sourceUrl??null}::text IS NOT NULL AND source_url=${item.sourceUrl??null})
            OR (${item.procedureNumber??null}::text IS NULL AND ${item.sourceUrl??null}::text IS NULL AND lower(title)=lower(${item.title}) AND lower(COALESCE(customer_name,''))=lower(COALESCE(${item.customerName??null},'')) AND submission_deadline IS NOT DISTINCT FROM ${item.submissionDeadline??null}::timestamptz)
          ) LIMIT 1
        `;
        if(duplicate){skipped.push({index,title:item.title,reason:"Возможный дубль",existingId:duplicate.id});continue;}
        const [created]=await tx<Array<{id:string}>>`
          INSERT INTO tenders(organization_id,title,customer_name,platform,procedure_number,source_url,source_name,publication_date,submission_deadline,initial_price,owner_user_id,created_by_user_id,assigned_team_id,next_action_text)
          VALUES(${actor.organizationId}::uuid,${item.title},${item.customerName??null},${item.platform??null},${item.procedureNumber??null},${item.sourceUrl??null},${item.sourceName??"Импорт из таблицы"},${item.publicationDate??null}::date,${item.submissionDeadline??null}::timestamptz,${item.initialPrice??null},${actor.userId}::uuid,${actor.userId}::uuid,${actor.teamIds[0]??null}::uuid,'Изучить условия тендера') RETURNING id
        `;
        await tx`INSERT INTO tender_assignments(organization_id,tender_id,role_code,user_id,assigned_by_user_id) VALUES(${actor.organizationId}::uuid,${created.id}::uuid,'owner',${actor.userId}::uuid,${actor.userId}::uuid)`;
        if(item.comment)await tx`INSERT INTO comments(organization_id,entity_type,entity_id,body,created_by_user_id) VALUES(${actor.organizationId}::uuid,'tender',${created.id}::uuid,${item.comment},${actor.userId}::uuid)`;
        imported.push({index,id:created.id,title:item.title});
      }
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'tender_import','imported',${`Импортировано тендеров: ${imported.length}`},${sql.json({imported:imported.length,skipped:skipped.length})})`;
      return {imported,skipped,total:body.rows.length};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте строки импорта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
