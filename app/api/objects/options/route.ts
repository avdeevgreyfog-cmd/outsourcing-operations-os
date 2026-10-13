import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {getObjectManagementOptions} from "@/lib/operations/object-management";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const schema=z.object({kind:z.enum(["client","legalEntity","region"]),name:z.string().trim().min(2).max(160),confirmDuplicate:z.boolean().default(false)});
export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход"},{status:401});
    const body=schema.parse(await request.json());
    requireCapability(actor,"operations.object.create");
    requireCapability(actor,body.kind==="client"?"sales.client.create":body.kind==="region"?"admin.permissions.manage":"organization.manage");
    if(actor.demo)return NextResponse.json({error:"В демо изменения не сохраняются"},{status:409});
    const result=await withTenant(actor.organizationId,actor.userId,async tx=>{
      const table={client:"client_companies",legalEntity:"legal_entities",region:"regions"}[body.kind];
      // Serialize duplicate checks within this tenant and option kind.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId+":"+body.kind},0))`;
      const matches=await tx.unsafe<Array<{id:string;name:string;organizationId:string;ownerUserId:string|null;createdByUserId:string|null;regionId:string|null;teamId:string|null}>>(`SELECT id,name,organization_id "organizationId"${body.kind==="client"?',owner_user_id "ownerUserId",created_by_user_id "createdByUserId",region_id "regionId",assigned_team_id "teamId"':''} FROM ${table} WHERE organization_id=$1::uuid AND lower(regexp_replace(trim(name),'\\s+',' ','g'))=lower(regexp_replace(trim($2),'\\s+',' ','g'))`,[actor.organizationId,body.name]);
      if(body.kind==="client"&&matches.some(row=>!canReadRow(actor.access,"sales.client.read",{...row,clientId:row.id},actor)))return {error:"Совпадающая запись уже есть, но недоступна вам. Обратитесь к ответственному за клиентскую базу.",duplicates:[]};
      if(matches.length&&!body.confirmDuplicate)return {duplicates:matches.map(({id,name})=>({id,name}))};
      if(body.kind==="legalEntity"&&matches.length)return {duplicates:matches};
      let rows:Array<{id:string;name:string}>;
      if(body.kind==="client")rows=await tx`INSERT INTO client_companies(organization_id,name,owner_user_id,created_by_user_id,assigned_team_id) VALUES(${actor.organizationId}::uuid,${body.name},${actor.userId}::uuid,${actor.userId}::uuid,${actor.teamIds[0]??null}::uuid) RETURNING id,name`;
      else if(body.kind==="legalEntity")rows=await tx`INSERT INTO legal_entities(organization_id,name) VALUES(${actor.organizationId}::uuid,${body.name}) RETURNING id,name`;
      else rows=await tx`INSERT INTO regions(organization_id,name,code) VALUES(${actor.organizationId}::uuid,${body.name},${"REG-"+crypto.randomUUID().slice(0,8)}) RETURNING id,name`;
      const created=rows[0];
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,${body.kind},${created.id}::uuid,'created',${"Создано из быстрого старта объекта: "+body.name},${tx.json({source:"object_quick_start"})})`;
      return created;
    });
    return NextResponse.json(result,{status:"duplicates" in result?409:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Укажите название — минимум 2 символа"},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось создать запись"},{status:500});
  }
}

export async function GET(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход"},{status:401});
    const query=new URL(request.url).searchParams;
    if(query.has("kind")){
      requireCapability(actor,"operations.object.edit");
      const input=requisitesIdentity.parse({kind:query.get("kind"),id:query.get("id")});
      requireCapability(actor,input.kind==="client"?"sales.client.edit":"organization.manage");
      const row=await withTenant(actor.organizationId,actor.userId,async tx=>{
        const [record]=input.kind==="client"
          ?await tx<Array<RequisitesRow>>`SELECT id,organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",region_id "regionId",assigned_team_id "teamId",inn,legal_name "legalName",NULL::text kpp,updated_at::text version FROM client_companies WHERE organization_id=${actor.organizationId}::uuid AND id=${input.id}::uuid`
          :await tx<Array<RequisitesRow>>`SELECT id,organization_id "organizationId",inn,kpp,NULL::text "legalName",updated_at::text version FROM legal_entities WHERE organization_id=${actor.organizationId}::uuid AND id=${input.id}::uuid AND active`;
        if(!record||input.kind==="client"&&!canReadRow(actor.access,"sales.client.edit",{...record,clientId:record.id},actor))throw new AccessDeniedError("sales.client.edit");
        return {inn:record.inn,kpp:record.kpp,legalName:record.legalName,version:record.version};
      });
      return NextResponse.json(row);
    }
    requireCapability(actor,"operations.object.create");
    return NextResponse.json(await getObjectManagementOptions(actor,{includeCreation:true}));
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректная запись"},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось загрузить параметры объекта"},{status:500});
  }
}

const requisitesIdentity=z.object({kind:z.enum(["client","legalEntity"]),id:z.string().uuid()});
const requisitesSchema=requisitesIdentity.extend({
  version:z.string().min(1).max(100),inn:z.string().trim().max(20).nullable(),
  kpp:z.string().trim().max(20).nullable().optional(),legalName:z.string().trim().max(240).nullable().optional(),
});
type RequisitesRow={id:string;organizationId:string;ownerUserId?:string|null;createdByUserId?:string|null;regionId?:string|null;teamId?:string|null;inn:string|null;kpp:string|null;legalName:string|null;version:string};
export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход"},{status:401});
    requireCapability(actor,"operations.object.edit");
    const body=requisitesSchema.parse(await request.json());
    requireCapability(actor,body.kind==="client"?"sales.client.edit":"organization.manage");
    if(actor.demo)return NextResponse.json({error:"В демо изменения не сохраняются"},{status:409});
    const result=await withTenant(actor.organizationId,actor.userId,async tx=>{
      const [current]=body.kind==="client"
        ?await tx<Array<RequisitesRow>>`SELECT id,organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",region_id "regionId",assigned_team_id "teamId",inn,legal_name "legalName",NULL::text kpp,updated_at::text version FROM client_companies WHERE organization_id=${actor.organizationId}::uuid AND id=${body.id}::uuid FOR UPDATE`
        :await tx<Array<RequisitesRow>>`SELECT id,organization_id "organizationId",inn,kpp,NULL::text "legalName",updated_at::text version FROM legal_entities WHERE organization_id=${actor.organizationId}::uuid AND id=${body.id}::uuid AND active FOR UPDATE`;
      if(!current||body.kind==="client"&&!canReadRow(actor.access,"sales.client.edit",{...current,clientId:current.id},actor))throw new AccessDeniedError("sales.client.edit");
      if(current.version!==body.version)return {conflict:true};
      const inn=body.inn||null;
      const kpp=body.kpp===undefined?current.kpp:body.kpp||null;
      const legalName=body.legalName===undefined?current.legalName:body.legalName||null;
      if(body.kind==="client")await tx`UPDATE client_companies SET inn=${inn},legal_name=${legalName},updated_at=now() WHERE organization_id=${actor.organizationId}::uuid AND id=${body.id}::uuid`;
      else await tx`UPDATE legal_entities SET inn=${inn},kpp=${kpp},updated_at=now() WHERE organization_id=${actor.organizationId}::uuid AND id=${body.id}::uuid`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,${body.kind==="client"?"client":"legal_entity"},${body.id}::uuid,'updated','Реквизиты дополнены из карточки объекта',${tx.json({source:"object_quick_start",before:{inn:current.inn,kpp:current.kpp,legalName:current.legalName},after:{inn,kpp,legalName}})})`;
      return {ok:true};
    });
    if("conflict" in result)return NextResponse.json({error:"Реквизиты изменились после открытия. Закройте и откройте форму заново; ваш ввод пока сохранён."},{status:409});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте реквизиты",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось сохранить реквизиты"},{status:500});
  }
}
