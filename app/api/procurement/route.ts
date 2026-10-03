import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const categoryCodes=[
  "workwear_ppe","tools_equipment","housing","transport","recruiting_advertising",
  "software_subscriptions","communications","medical","training","office_household",
  "rent","services","other",
] as const;

const schema=z.object({
  objectId:z.string().uuid().nullable().optional(),
  legalEntityId:z.string().uuid().nullable().optional(),
  orgUnitId:z.string().uuid().nullable().optional(),
  requestType:z.enum(["purchase","payment","compensation","service"]),
  categoryCode:z.enum(categoryCodes).default("other"),
  priority:z.enum(["normal","urgent","critical"]).default("normal"),
  urgencyReason:z.string().trim().min(2).max(500).nullable().optional(),
  title:z.string().trim().min(2).max(240),
  description:z.string().trim().max(2000).nullable().optional(),
  itemId:z.string().uuid().nullable().optional(),
  locationId:z.string().uuid().nullable().optional(),
  quantity:z.number().positive().nullable().optional(),
  unit:z.string().trim().max(40).nullable().optional(),
  amount:z.number().min(0).nullable().optional(),
  vendor:z.string().trim().max(240).nullable().optional(),
  partnerId:z.string().uuid().nullable().optional(),
  sourceName:z.string().trim().max(120).nullable().optional(),
  sourceUrl:z.string().trim().url().max(1200).nullable().optional(),
  neededBy:z.string().date().nullable().optional(),
}).superRefine((value,ctx)=>{
  if(value.priority!=="normal"&&!value.urgencyReason){
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["urgencyReason"],message:"Для срочной заявки укажите причину"});
  }
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"procurement.create");
    if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let objectLegalEntityId:string|null=null;
      if(body.objectId){
        const [object]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];legalEntityId:string|null}>>`
          SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",o.legal_entity_id "legalEntityId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
          FROM objects o WHERE o.id=${body.objectId}::uuid
        `;
        if(!object)throw new Error("Объект не найден");
        const mayUseObject=actor.access.allOrg
          || canReadRow(actor.access,"procurement.create",object,actor)
          || (actor.access.capabilities.includes("operations.object.read")&&!actor.access.denies.includes("operations.object.read")&&canReadRow(actor.access,"operations.object.read",object,actor));
        if(!mayUseObject)throw new AccessDeniedError("procurement.create");
        objectLegalEntityId=object.legalEntityId;
      }

      if(body.locationId){
        const [location]=await tx<Array<{organizationId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
          SELECT l.organization_id "organizationId",l.object_id "objectId",COALESCE(l.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=l.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
              || CASE WHEN l.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[l.responsible_user_id::text] END "assigneeUserIds"
          FROM storage_locations l LEFT JOIN objects o ON o.id=l.object_id
          WHERE l.id=${body.locationId}::uuid AND l.active
        `;
        if(!location)throw new Error("Место получения не найдено");
        if(body.objectId&&location.objectId&&location.objectId!==body.objectId)throw new Error("Место получения относится к другому объекту");
      }

      const requestedLegalEntityId=body.legalEntityId??objectLegalEntityId;
      const [legalEntity]=requestedLegalEntityId
        ? await tx<Array<{id:string}>>`SELECT id FROM legal_entities WHERE id=${requestedLegalEntityId}::uuid AND active`
        : await tx<Array<{id:string}>>`SELECT id FROM legal_entities WHERE active ORDER BY is_primary DESC,name LIMIT 1`;
      if(!legalEntity)throw new Error("Не удалось определить юридическое лицо-плательщика");
      if(objectLegalEntityId&&legalEntity.id!==objectLegalEntityId)throw new Error("Для заявки по объекту плательщик должен совпадать с юридическим лицом объекта");

      const [membership]=await tx<Array<{orgUnitId:string|null}>>`
        SELECT primary_org_unit_id "orgUnitId" FROM organization_memberships WHERE id=${actor.membershipId}::uuid AND status='active'
      `;
      const orgUnitId=body.orgUnitId??membership?.orgUnitId??null;
      if(orgUnitId){
        const [unit]=await tx<Array<{id:string}>>`SELECT id FROM organization_units WHERE id=${orgUnitId}::uuid AND active`;
        if(!unit)throw new Error("Подразделение не найдено");
        const createScopes=actor.access.scopes["procurement.create"]??[];
        const mayUseAnyUnit=actor.access.allOrg||createScopes.some(scope=>scope.type==="all_org");
        if(!mayUseAnyUnit&&!actor.orgUnitIds.includes(orgUnitId))throw new AccessDeniedError("procurement.create");
      }

      if(body.partnerId){
        const [partner]=await tx<Array<{id:string}>>`SELECT id FROM supply_partners WHERE id=${body.partnerId}::uuid AND status<>'archived'`;
        if(!partner)throw new Error("Поставщик не найден");
      }
      if(body.itemId){
        const [item]=await tx<Array<{id:string}>>`SELECT id FROM inventory_items WHERE id=${body.itemId}::uuid AND active`;
        if(!item)throw new Error("Позиция имущества не найдена");
      }

      const processRole=body.requestType==="payment"||body.requestType==="compensation"?"finance-controller":"supply-owner";
      const [assignee]=await tx<Array<{userId:string}>>`
        SELECT m.user_id "userId"
        FROM membership_process_roles mr
        JOIN process_roles pr ON pr.id=mr.process_role_id
        JOIN organization_memberships m ON m.id=mr.membership_id
        WHERE pr.code=${processRole} AND pr.active AND m.status='active'
          AND mr.effective_from<=current_date AND (mr.effective_to IS NULL OR mr.effective_to>=current_date)
        ORDER BY mr.org_unit_id IS NULL DESC,m.created_at
        LIMIT 1
      `;

      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO supply_requests(
          organization_id,object_id,legal_entity_id,organization_unit_id,request_type,category_code,priority,urgency_reason,
          title,description,item_id,location_id,quantity,unit,amount,vendor,partner_id,source_name,source_url,needed_by,status,
          created_by_user_id,assigned_to_user_id
        )
        VALUES(
          ${actor.organizationId}::uuid,${body.objectId??null}::uuid,${legalEntity.id}::uuid,${orgUnitId}::uuid,${body.requestType},${body.categoryCode},${body.priority},${body.urgencyReason??null},
          ${body.title},${body.description??null},${body.itemId??null}::uuid,${body.locationId??null}::uuid,${body.quantity??null},${body.unit??null},${body.amount??null},${body.vendor??null},${body.partnerId??null}::uuid,
          ${body.sourceName??null},${body.sourceUrl??null},${body.neededBy??null}::date,'submitted',${actor.userId}::uuid,${assignee?.userId??null}::uuid
        )
        RETURNING id
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'supply_request',${row.id}::uuid,'submitted',${"Создана внутренняя заявка: "+body.title},
          ${tx.json({objectId:body.objectId??null,legalEntityId:legalEntity.id,orgUnitId,requestType:body.requestType,categoryCode:body.categoryCode,itemId:body.itemId??null,quantity:body.quantity??null,amount:body.amount??null})})
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заявку",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать заявку"},{status:500});
  }
}

const patchSchema=z.union([
  z.object({id:z.string().uuid(),status:z.enum(["in_progress","received","closed"])}),
  z.object({id:z.string().uuid(),paymentAction:z.literal("queue"),approvedAmount:z.number().min(0).nullable().optional()}),
  z.object({id:z.string().uuid(),paymentAction:z.literal("paid"),actualAmount:z.number().positive(),paymentReference:z.string().trim().max(240).nullable().optional()}),
]);

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    if(actor.demo)return NextResponse.json({ok:true});
    const body=patchSchema.parse(await request.json());
    if("paymentAction" in body&&body.paymentAction==="paid")requireCapability(actor,"procurement.finance");
    else requireCapability(actor,"procurement.manage");

    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [row]=await tx<Array<{
        id:string;organizationId:string;objectId:string|null;legalEntityId:string|null;orgUnitId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
        requestType:string;categoryCode:string;title:string;status:string;paymentStatus:string;itemId:string|null;locationId:string|null;quantity:number|null;amount:number|null;
        vendor:string|null;partner:string|null
      }>>`
        SELECT r.id,r.organization_id "organizationId",r.object_id "objectId",r.legal_entity_id "legalEntityId",r.organization_unit_id "orgUnitId",
          COALESCE(r.assigned_to_user_id,o.owner_user_id,r.created_by_user_id) "ownerUserId",o.region_id "regionId",
          ARRAY_REMOVE(ARRAY[r.created_by_user_id::text,r.assigned_to_user_id::text,o.owner_user_id::text],NULL) "assigneeUserIds",
          r.request_type "requestType",r.category_code "categoryCode",r.title,r.status,r.payment_status "paymentStatus",r.item_id "itemId",r.location_id "locationId",
          r.quantity::numeric quantity,r.amount::numeric amount,r.vendor,sp.name partner
        FROM supply_requests r
        LEFT JOIN objects o ON o.id=r.object_id
        LEFT JOIN supply_partners sp ON sp.id=r.partner_id
        WHERE r.id=${body.id}::uuid FOR UPDATE OF r
      `;
      if(!row)throw new Error("Внутренняя заявка не найдена");
      const capability="paymentAction" in body&&body.paymentAction==="paid"?"procurement.finance":"procurement.manage";
      if(!canReadRow(actor.access,capability,row,actor))throw new AccessDeniedError(capability);

      if("status" in body){
        const allowed:Record<string,string[]>={approved:["in_progress","received"],in_progress:["received","closed"],received:["closed"]};
        if(!(allowed[row.status]??[]).includes(body.status))throw new Error("Недопустимый переход статуса заявки");

        if(body.status==="received"&&row.requestType==="purchase"&&row.itemId&&row.locationId&&Number(row.quantity)>0){
          const [existing]=await tx<Array<{id:string}>>`
            SELECT id FROM inventory_movements WHERE reference=${row.id} AND movement_type='receipt' LIMIT 1
          `;
          if(!existing){
            await tx`
              INSERT INTO inventory_movements(organization_id,item_id,variant,movement_type,quantity,to_location_id,unit_cost,note,reference,created_by_user_id)
              VALUES(${actor.organizationId}::uuid,${row.itemId}::uuid,'','receipt',${Number(row.quantity)},${row.locationId}::uuid,
                ${row.amount&&Number(row.quantity)?Number(row.amount)/Number(row.quantity):null},
                ${"Поступление по внутренней заявке: "+row.title},${row.id},${actor.userId}::uuid)
            `;
          }
        }

        await tx`
          UPDATE supply_requests
          SET status=${body.status},fulfilled_quantity=CASE WHEN ${body.status}='received' AND quantity IS NOT NULL THEN quantity ELSE fulfilled_quantity END,updated_at=now()
          WHERE id=${row.id}::uuid
        `;
        await tx`
          INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'supply_request',${row.id}::uuid,'status_changed',
            ${"Статус внутренней заявки: "+row.status+" → "+body.status},${tx.json({from:row.status,to:body.status})})
        `;
        return {id:row.id,status:body.status};
      }

      if(body.paymentAction==="queue"){
        if(!["approved","in_progress","received"].includes(row.status))throw new Error("На оплату можно передать только согласованную заявку");
        const approvedAmount=body.approvedAmount??row.amount;
        await tx`UPDATE supply_requests SET approved_amount=${approvedAmount??null},payment_status='pending',updated_at=now() WHERE id=${row.id}::uuid`;
        await tx`
          INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'supply_request',${row.id}::uuid,'payment_requested',
            ${"Внутренняя заявка передана на оплату: "+row.title},${tx.json({approvedAmount})})
        `;
        return {id:row.id,paymentStatus:"pending"};
      }

      if(row.paymentStatus!=="pending")throw new Error("Заявка не находится в очереди на оплату");
      const [existingExpense]=await tx<Array<{id:string}>>`SELECT id FROM object_expenses WHERE supply_request_id=${row.id}::uuid ORDER BY created_at DESC LIMIT 1`;
      if(!existingExpense){
        await tx`
          INSERT INTO object_expenses(
            organization_id,object_id,legal_entity_id,organization_unit_id,expense_date,category,amount,vendor,reference,plan_fact,created_by_user_id,supply_request_id
          )
          VALUES(
            ${actor.organizationId}::uuid,${row.objectId}::uuid,${row.legalEntityId}::uuid,${row.orgUnitId}::uuid,current_date,${row.categoryCode},${body.actualAmount},
            ${row.partner??row.vendor},${body.paymentReference??row.title},'fact',${actor.userId}::uuid,${row.id}::uuid
          )
        `;
      }
      const nextStatus=(row.requestType==="payment"||row.requestType==="compensation")?"received":row.status;
      await tx`
        UPDATE supply_requests SET actual_amount=${body.actualAmount},payment_status='paid',paid_at=now(),paid_by_user_id=${actor.userId}::uuid,
          payment_reference=${body.paymentReference??null},status=${nextStatus},updated_at=now()
        WHERE id=${row.id}::uuid
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'supply_request',${row.id}::uuid,'paid',
          ${"Оплачена внутренняя заявка: "+row.title},${tx.json({actualAmount:body.actualAmount,paymentReference:body.paymentReference??null})})
      `;
      return {id:row.id,status:nextStatus,paymentStatus:"paid",actualAmount:body.actualAmount};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте изменение заявки",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось изменить заявку"},{status:500});
  }
}
