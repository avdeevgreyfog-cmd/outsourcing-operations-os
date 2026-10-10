import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentActor} from '@/lib/auth/server';
import {requireCapability,AccessDeniedError} from '@/lib/access/server';
import {canReadRow} from '@/lib/core/access.mjs';
import {getCommercialRequest} from '@/lib/commercial/service';
import {mergeContactIntake} from '@/lib/commercial/contact-snapshot';
import {toJsonValue} from '@/lib/commercial/request-intake';
import {assertEditVersion,EditConflictError} from '@/lib/commercial/edit-conflict';
import {withTenant} from '@/lib/db/client';
const values=z.object({fullName:z.string().trim().min(2).max(180),position:z.string().trim().max(180).optional(),phone:z.string().trim().max(80),email:z.union([z.literal(''),z.string().trim().email().max(240)]),telegram:z.string().trim().max(120),whatsapp:z.string().trim().max(120),maxContact:z.string().trim().max(120),preferredChannel:z.enum(['','phone','email','telegram','whatsapp','max']).optional()});
const schema=z.object({expectedUpdatedAt:z.string(),mode:z.enum(['snapshot','existing','new']),contactId:z.string().uuid().nullable(),values});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:'Необходимо войти в систему'},{status:401});requireCapability(actor,'sales.request.edit');if(actor.demo)return NextResponse.json({error:'Демонстрационные изменения сохраняются в браузере'},{status:409});const {id}=await params;const body=schema.parse(await request.json());const record=await getCommercialRequest(actor,id);if(!record)return NextResponse.json({error:'Заявка не найдена'},{status:404});if(!canReadRow(actor.access,'sales.request.edit',record,actor))throw new AccessDeniedError('sales.request.edit');
 const contactId=await withTenant(actor.organizationId,actor.userId,async tx=>{
  const [locked]=await tx<Array<{updatedAt:string;status:string;archivedAt:string|null;clientId:string|null;intake:unknown}>>`SELECT updated_at::text "updatedAt",status,archived_at::text "archivedAt",client_company_id "clientId",intake_json intake FROM requests WHERE id=${id}::uuid FOR UPDATE`;
  if(!locked)throw Error('Заявка не найдена');assertEditVersion(body.expectedUpdatedAt,locked.updatedAt);if(locked.archivedAt||['accepted','launched'].includes(locked.status))throw Error('Заявка зафиксирована или находится в архиве');
  let selected:string|null=null;let contact=body.values;
  if(body.mode!=='snapshot'){
   if(!locked.clientId)throw Error('Сначала привяжите заявку к клиенту');requireCapability(actor,body.mode==='new'?'sales.client.edit':'sales.client.read');
   const [client]=await tx<Array<{id:string;organizationId:string;ownerUserId:string|null;createdByUserId:string;regionId:string|null;teamId:string|null}>>`SELECT id,organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",region_id "regionId",assigned_team_id "teamId" FROM client_companies WHERE id=${locked.clientId}::uuid FOR UPDATE`;
   if(!client||!canReadRow(actor.access,body.mode==='new'?'sales.client.edit':'sales.client.read',{...client,clientId:client.id},actor))throw new AccessDeniedError('sales.client.edit');
   if(body.mode==='existing'){
    const [row]=await tx<Array<z.infer<typeof values>&{id:string}>>`SELECT id,full_name "fullName",COALESCE(position,'') position,COALESCE(phone,'') phone,COALESCE(email,'') email,COALESCE(telegram,'') telegram,COALESCE(whatsapp,'') whatsapp,COALESCE(max_contact,'') "maxContact" FROM contacts WHERE id=${body.contactId}::uuid AND client_company_id=${locked.clientId}::uuid`;
    if(!row)throw Error('Контакт не принадлежит выбранному клиенту');selected=row.id;contact=row;
   }else{
    const [duplicate]=await tx<Array<{id:string}>>`SELECT id FROM contacts WHERE client_company_id=${locked.clientId}::uuid AND lower(full_name)=lower(${contact.fullName}) AND ((${contact.phone}<>'' AND regexp_replace(phone,'[^0-9]','','g')=regexp_replace(${contact.phone},'[^0-9]','','g')) OR (${contact.email}<>'' AND lower(email)=lower(${contact.email}))) LIMIT 1`;
    if(duplicate)throw new Error('Такой контакт уже есть у клиента. Выберите его из списка.');
    const [created]=await tx<Array<{id:string}>>`INSERT INTO contacts(organization_id,client_company_id,full_name,position,phone,email,telegram,whatsapp,max_contact,communication_preference,owner_user_id,created_by_user_id) VALUES(${actor.organizationId}::uuid,${locked.clientId}::uuid,${contact.fullName},${contact.position||null},${contact.phone||null},${contact.email||null},${contact.telegram||null},${contact.whatsapp||null},${contact.maxContact||null},${contact.preferredChannel||null},${actor.userId}::uuid,${actor.userId}::uuid) RETURNING id`;selected=created.id;
    await tx`UPDATE client_companies SET updated_at=now() WHERE id=${locked.clientId}::uuid`;
    await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'client',${locked.clientId}::uuid,'contact_added','Добавлен контакт клиента из заявки')`;
   }
  }
  const next=mergeContactIntake(locked.intake,contact,body.mode==='snapshot');
  await tx`UPDATE requests SET contact_id=${selected}::uuid,intake_json=${tx.json(toJsonValue(next))},updated_at=now() WHERE id=${id}::uuid`;
  await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'request',${id}::uuid,'updated','Обновлён контакт заявки')`;return selected;
 });return NextResponse.json({id,contactId});
 }catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'Проверьте контактные данные'},{status:400});if(e instanceof AccessDeniedError)return NextResponse.json({error:'Недостаточно прав для контакта клиента'},{status:403});if(e instanceof EditConflictError)return NextResponse.json({error:e.message},{status:409});return NextResponse.json({error:e instanceof Error?e.message:'Не удалось сохранить контакт'},{status:400});}
}
