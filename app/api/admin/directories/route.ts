import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";

const bodySchema=z.object({
  kind:z.enum(["region","specialty"]),
  id:z.string().uuid().optional(),
  name:z.string().trim().min(2).max(240),
  aliases:z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  active:z.boolean().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"admin.permissions.manage");
    if(actor.demo)return NextResponse.json({error:"Демо-справочники доступны только для просмотра"},{status:409});
    const body=bodySchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async(sql)=>sql.begin(async(tx)=>{
      if(body.kind==="region"){
        const [duplicate]=await tx<Array<{id:string}>>`SELECT id FROM regions WHERE lower(name)=lower(${body.name}) LIMIT 1`;
        if(duplicate)throw new Error("Такой регион уже существует");
        const [row]=await tx<Array<{id:string}>>`
          INSERT INTO regions(organization_id,code,name)
          VALUES(${actor.organizationId}::uuid,'region-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),${body.name})
          RETURNING id
        `;
        const summary="Добавлен регион: "+body.name;
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'directory_region',${row.id}::uuid,'created',${summary})`;
        return row;
      }
      const [duplicate]=await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE lower(name)=lower(${body.name}) LIMIT 1`;
      if(duplicate)throw new Error("Такая специальность уже существует");
      const aliases=[...new Set((body.aliases??[]).map(item=>item.trim()).filter(Boolean))];
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO specialties(organization_id,code,name,aliases,active)
        VALUES(${actor.organizationId}::uuid,'specialty-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),${body.name},${aliases}::text[],true)
        RETURNING id
      `;
      const summary="Добавлена специальность: "+body.name;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'directory_specialty',${row.id}::uuid,'created',${summary})`;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные справочника",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"admin.permissions.manage");
    if(actor.demo)return NextResponse.json({error:"Демо-справочники доступны только для просмотра"},{status:409});
    const body=bodySchema.extend({id:z.string().uuid()}).parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async(sql)=>sql.begin(async(tx)=>{
      if(body.kind==="region"){
        const [duplicate]=await tx<Array<{id:string}>>`SELECT id FROM regions WHERE lower(name)=lower(${body.name}) AND id<>${body.id}::uuid LIMIT 1`;
        if(duplicate)throw new Error("Такой регион уже существует");
        const [row]=await tx<Array<{id:string}>>`UPDATE regions SET name=${body.name} WHERE id=${body.id}::uuid RETURNING id`;
        if(!row)return null;
        const summary="Изменён регион: "+body.name;
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'directory_region',${body.id}::uuid,'updated',${summary})`;
        return row;
      }
      const [duplicate]=await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE lower(name)=lower(${body.name}) AND id<>${body.id}::uuid LIMIT 1`;
      if(duplicate)throw new Error("Такая специальность уже существует");
      const active=body.active??true;
      if(!active){
        const [usage]=await tx<Array<{count:number}>>`SELECT count(*)::int count FROM needs WHERE specialty_id=${body.id}::uuid AND status IN ('open','in_progress','paused')`;
        if((usage?.count??0)>0)throw new Error("Нельзя отключить специальность, пока есть активные потребности");
      }
      const aliases=[...new Set((body.aliases??[]).map(item=>item.trim()).filter(Boolean))];
      const [row]=await tx<Array<{id:string}>>`
        UPDATE specialties SET name=${body.name},aliases=${aliases}::text[],active=${active}
        WHERE id=${body.id}::uuid RETURNING id
      `;
      if(!row)return null;
      const summary="Изменена специальность: "+body.name;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'directory_specialty',${body.id}::uuid,'updated',${summary})`;
      return row;
    }));
    if(!result)return NextResponse.json({error:"Запись не найдена"},{status:404});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные справочника",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
