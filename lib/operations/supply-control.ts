import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type SupplyPartnerServiceRow={
  id:string;category:string;serviceName:string;unit:string|null;price:number|null;
  effectiveFrom:string|null;effectiveTo:string|null;notes:string|null;
};
export type SupplyPartnerRow={
  id:string;organizationId:string;name:string;legalName:string|null;taxId:string|null;categories:string[];
  contactName:string|null;phone:string|null;email:string|null;address:string|null;paymentTerms:string|null;notes:string|null;
  status:string;ownerUserId:string|null;owner:string|null;services:SupplyPartnerServiceRow[];
};
export type HousingContractRow={
  id:string;organizationId:string;siteId:string;site:string;objectId:string|null;object:string|null;
  managerId:string|null;manager:string|null;partnerId:string|null;partner:string|null;contractNumber:string|null;
  signedOn:string|null;validFrom:string;validTo:string|null;billingModel:string;bookedCapacity:number|null;
  rateAmount:number;depositAmount:number|null;paymentDay:number|null;prepaidUntil:string|null;nextPaymentDue:string|null;
  noticeDays:number|null;autoRenew:boolean;active:boolean;notes:string|null;
  lastPaymentAmount:number|null;lastPaymentDate:string|null;
  ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
};
export type TransportOperationRow={
  id:string;organizationId:string;operationType:"employee_trip"|"hired_transport";objectId:string|null;object:string|null;
  managerId:string|null;manager:string|null;workerId:string|null;worker:string|null;partnerId:string|null;partner:string|null;
  transportKind:string;routeFrom:string|null;routeTo:string|null;departureAt:string|null;departureIso:string|null;arrivalAt:string|null;
  scheduleText:string|null;capacity:number|null;paymentModel:string|null;amount:number|null;paymentDue:string|null;prepaidUntil:string|null;
  status:string;notes:string|null;lastPaymentAmount:number|null;lastPaymentDate:string|null;
  ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
};
export type InventoryMovementRow={
  id:string;itemId:string;item:string;variant:string;movementType:string;quantity:number;unit:string;
  fromLocationId:string|null;fromLocation:string|null;toLocationId:string|null;toLocation:string|null;
  workerId:string|null;worker:string|null;objectId:string|null;object:string|null;manager:string|null;
  condition:string|null;sourceCondition:string|null;targetCondition:string|null;unitCost:number|null;note:string|null;reference:string|null;occurredAt:string;createdBy:string;
  ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
};
export type WorkerAssetHoldingRow={
  workerId:string;worker:string;objectId:string|null;object:string|null;manager:string|null;
  itemId:string;item:string;variant:string;quantity:number;unit:string;returnable:boolean;
  lastIssuedAt:string|null;replacementCycleDays:number|null;nextReplacementAt:string|null;
  ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
};

function isoDate(value:string|null|undefined){return value??null}
function demoObjectFor(actor:Actor,capability:string){
  return demo.objects.find(row=>canReadRow(actor.access,capability,row,actor))??null;
}

export async function listSupplyPartners(actor:Actor):Promise<SupplyPartnerRow[]>{
  requireCapability(actor,"supplier.read");
  if(actor.demo){
    const object=demoObjectFor(actor,"supplier.read")??demo.objects[0];
    return [
      {id:"demo-partner-housing",organizationId:actor.organizationId,name:"Хостел Профи",legalName:"ООО «Хостел Профи»",taxId:null,categories:["housing"],contactName:"Администратор",phone:"+7 900 000-00-01",email:null,address:null,paymentTerms:"Предоплата до 25 числа",notes:null,status:"active",ownerUserId:object.ownerUserId??actor.userId,owner:object.ownerName??actor.displayName,services:[{id:"demo-service-bed",category:"housing",serviceName:"Койко-место",unit:"месяц",price:18000,effectiveFrom:null,effectiveTo:null,notes:null}]},
      {id:"demo-partner-transport",organizationId:actor.organizationId,name:"ТрансЛайн",legalName:"ООО «ТрансЛайн»",taxId:null,categories:["transport"],contactName:"Диспетчер",phone:"+7 900 000-00-02",email:null,address:null,paymentTerms:"Постоплата 5 дней",notes:null,status:"active",ownerUserId:object.ownerUserId??actor.userId,owner:object.ownerName??actor.displayName,services:[{id:"demo-service-bus",category:"transport",serviceName:"Автобус 20 мест",unit:"рейс",price:6500,effectiveFrom:null,effectiveTo:null,notes:null}]},
    ];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<SupplyPartnerRow>>`
      SELECT sp.id,sp.organization_id "organizationId",sp.name,sp.legal_name "legalName",sp.tax_id "taxId",sp.categories,
        sp.contact_name "contactName",sp.phone,sp.email,sp.address_text address,sp.payment_terms "paymentTerms",sp.notes,sp.status,
        sp.owner_user_id "ownerUserId",owner.display_name owner,
        COALESCE(jsonb_agg(jsonb_build_object(
          'id',s.id,'category',s.category,'serviceName',s.service_name,'unit',s.unit,'price',s.price,
          'effectiveFrom',s.effective_from::text,'effectiveTo',s.effective_to::text,'notes',s.notes
        ) ORDER BY s.category,s.service_name) FILTER (WHERE s.id IS NOT NULL),'[]'::jsonb) services
      FROM supply_partners sp
      LEFT JOIN app_users owner ON owner.id=sp.owner_user_id
      LEFT JOIN supply_partner_services s ON s.partner_id=sp.id
      WHERE sp.status<>'archived'
      GROUP BY sp.id,owner.display_name
      ORDER BY sp.name
    `;
    return rows.filter(row=>canReadRow(actor.access,"supplier.read",row,actor)).map(row=>({...row,services:row.services.map(item=>({...item,price:item.price==null?null:Number(item.price)}))}));
  });
}

export async function listHousingContracts(actor:Actor):Promise<HousingContractRow[]>{
  requireCapability(actor,"supply.housing.read");
  if(actor.demo){
    const object=demoObjectFor(actor,"supply.housing.read")??demo.objects[0];
    return [{
      id:"demo-housing-contract",organizationId:actor.organizationId,siteId:"demo-housing-1",site:"Общежитие рядом с объектом",
      objectId:object.id,object:object.name,managerId:object.ownerUserId??null,manager:object.ownerName??null,
      partnerId:"demo-partner-housing",partner:"Хостел Профи",contractNumber:"12/26",signedOn:"01.09.2026",validFrom:"01.09.2026",validTo:"31.12.2026",
      billingModel:"bed_month",bookedCapacity:6,rateAmount:18000,depositAmount:18000,paymentDay:25,prepaidUntil:"31.10.2026",nextPaymentDue:"25.10.2026",
      noticeDays:14,autoRenew:false,active:true,notes:null,lastPaymentAmount:54000,lastPaymentDate:"25.09.2026",
      ownerUserId:object.ownerUserId??null,regionId:object.regionId??null,assigneeUserIds:object.assigneeUserIds??[],
    }];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<HousingContractRow>>`
      SELECT hc.id,hc.organization_id "organizationId",hc.site_id "siteId",hs.name site,
        hs.primary_object_id "objectId",o.name object,o.owner_user_id "managerId",manager.display_name manager,
        hc.partner_id "partnerId",sp.name partner,hc.contract_number "contractNumber",
        to_char(hc.signed_on,'DD.MM.YYYY') "signedOn",to_char(hc.valid_from,'DD.MM.YYYY') "validFrom",to_char(hc.valid_to,'DD.MM.YYYY') "validTo",
        hc.billing_model "billingModel",hc.booked_capacity "bookedCapacity",hc.rate_amount::numeric "rateAmount",
        hc.deposit_amount::numeric "depositAmount",hc.payment_day "paymentDay",
        to_char(hc.prepaid_until,'DD.MM.YYYY') "prepaidUntil",to_char(hc.next_payment_due,'DD.MM.YYYY') "nextPaymentDue",
        hc.notice_days "noticeDays",hc.auto_renew "autoRenew",hc.active,hc.notes,
        last_exp.amount::numeric "lastPaymentAmount",to_char(last_exp.expense_date,'DD.MM.YYYY') "lastPaymentDate",
        COALESCE(hs.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=hs.primary_object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "assigneeUserIds"
      FROM housing_contracts hc
      JOIN housing_sites hs ON hs.id=hc.site_id
      LEFT JOIN objects o ON o.id=hs.primary_object_id
      LEFT JOIN app_users manager ON manager.id=o.owner_user_id
      LEFT JOIN supply_partners sp ON sp.id=hc.partner_id
      LEFT JOIN LATERAL (
        SELECT e.amount,e.expense_date FROM object_expenses e
        WHERE e.housing_contract_id=hc.id AND e.plan_fact='fact'
        ORDER BY e.expense_date DESC,e.created_at DESC LIMIT 1
      ) last_exp ON true
      ORDER BY hc.active DESC,hc.next_payment_due NULLS LAST,hs.name
    `;
    return rows.filter(row=>canReadRow(actor.access,"supply.housing.read",row,actor)).map(row=>({...row,rateAmount:Number(row.rateAmount),depositAmount:row.depositAmount==null?null:Number(row.depositAmount),lastPaymentAmount:row.lastPaymentAmount==null?null:Number(row.lastPaymentAmount)}));
  });
}

export async function listTransportOperations(actor:Actor):Promise<TransportOperationRow[]>{
  requireCapability(actor,"supply.transport.read");
  if(actor.demo){
    const object=demoObjectFor(actor,"supply.transport.read")??demo.objects[0];
    const worker=demo.workers.find(row=>row.objectId===object.id)??demo.workers[0];
    return [
      {id:"demo-trip",organizationId:actor.organizationId,operationType:"employee_trip",objectId:object.id,object:object.name,managerId:object.ownerUserId??null,manager:object.ownerName??null,workerId:worker?.id??null,worker:worker?.fullName??null,partnerId:null,partner:null,transportKind:"train",routeFrom:"Москва",routeTo:"Тверь",departureAt:"05.10.2026 08:30",departureIso:"2026-10-05T08:30:00Z",arrivalAt:"05.10.2026 10:15",scheduleText:null,capacity:null,paymentModel:"ticket",amount:2400,paymentDue:null,prepaidUntil:null,status:"booked",notes:"Билет сотруднику",lastPaymentAmount:2400,lastPaymentDate:"01.10.2026",ownerUserId:object.ownerUserId??null,regionId:object.regionId??null,assigneeUserIds:object.assigneeUserIds??[]},
      {id:"demo-shuttle",organizationId:actor.organizationId,operationType:"hired_transport",objectId:object.id,object:object.name,managerId:object.ownerUserId??null,manager:object.ownerName??null,workerId:null,worker:null,partnerId:"demo-partner-transport",partner:"ТрансЛайн",transportKind:"shuttle",routeFrom:"Общежитие",routeTo:object.name,departureAt:null,departureIso:null,arrivalAt:null,scheduleText:"Ежедневно 06:45 / 20:15",capacity:20,paymentModel:"day",amount:6500,paymentDue:"05.10.2026",prepaidUntil:"04.10.2026",status:"booked",notes:null,lastPaymentAmount:45500,lastPaymentDate:"28.09.2026",ownerUserId:object.ownerUserId??null,regionId:object.regionId??null,assigneeUserIds:object.assigneeUserIds??[]},
    ];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<TransportOperationRow>>`
      SELECT t.id,t.organization_id "organizationId",t.operation_type "operationType",
        COALESCE(t.object_id,wa.object_id) "objectId",COALESCE(o.name,wo.name) object,
        COALESCE(o.owner_user_id,wa.manager_user_id,t.owner_user_id) "managerId",
        COALESCE(manager.display_name,worker_manager.display_name,owner.display_name) manager,
        t.worker_id "workerId",w.full_name worker,t.partner_id "partnerId",sp.name partner,t.transport_kind "transportKind",
        t.route_from "routeFrom",t.route_to "routeTo",
        to_char(t.departure_at,'DD.MM.YYYY HH24:MI') "departureAt",t.departure_at::text "departureIso",
        to_char(t.arrival_at,'DD.MM.YYYY HH24:MI') "arrivalAt",t.schedule_text "scheduleText",t.capacity,
        t.payment_model "paymentModel",t.amount::numeric amount,to_char(t.payment_due,'DD.MM.YYYY') "paymentDue",
        to_char(t.prepaid_until,'DD.MM.YYYY') "prepaidUntil",t.status,t.notes,
        last_exp.amount::numeric "lastPaymentAmount",to_char(last_exp.expense_date,'DD.MM.YYYY') "lastPaymentDate",
        COALESCE(t.owner_user_id,o.owner_user_id,wa.manager_user_id,t.created_by_user_id) "ownerUserId",
        COALESCE(o.region_id,wo.region_id) "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=COALESCE(t.object_id,wa.object_id) AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || CASE WHEN t.owner_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[t.owner_user_id::text] END "assigneeUserIds"
      FROM transport_operations t
      LEFT JOIN objects o ON o.id=t.object_id
      LEFT JOIN app_users manager ON manager.id=o.owner_user_id
      LEFT JOIN worker_profiles w ON w.id=t.worker_id
      LEFT JOIN LATERAL (
        SELECT x.object_id,x.manager_user_id FROM worker_object_assignments x
        WHERE x.worker_id=t.worker_id
        ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC LIMIT 1
      ) wa ON true
      LEFT JOIN objects wo ON wo.id=wa.object_id
      LEFT JOIN app_users worker_manager ON worker_manager.id=wa.manager_user_id
      LEFT JOIN app_users owner ON owner.id=t.owner_user_id
      LEFT JOIN supply_partners sp ON sp.id=t.partner_id
      LEFT JOIN LATERAL (
        SELECT e.amount,e.expense_date FROM object_expenses e
        WHERE e.transport_operation_id=t.id AND e.plan_fact='fact'
        ORDER BY e.expense_date DESC,e.created_at DESC LIMIT 1
      ) last_exp ON true
      ORDER BY (t.status IN ('completed','cancelled')),t.departure_at NULLS LAST,t.created_at DESC
    `;
    return rows.filter(row=>canReadRow(actor.access,"supply.transport.read",row,actor)).map(row=>({...row,amount:row.amount==null?null:Number(row.amount),lastPaymentAmount:row.lastPaymentAmount==null?null:Number(row.lastPaymentAmount)}));
  });
}

export async function listInventoryMovements(actor:Actor):Promise<InventoryMovementRow[]>{
  requireCapability(actor,"assets.read");
  if(actor.demo){
    const object=demoObjectFor(actor,"assets.read")??demo.objects[0];
    const worker=demo.workers.find(row=>row.objectId===object.id)??demo.workers[0];
    return [{id:"demo-movement-1",itemId:"demo-item-jacket",item:"Куртка рабочая",variant:"52",movementType:"issue",quantity:1,unit:"шт",fromLocationId:"demo-location-manager",fromLocation:"Запас менеджера",toLocationId:null,toLocation:null,workerId:worker?.id??null,worker:worker?.fullName??null,objectId:object.id,object:object.name,manager:object.ownerName??null,condition:"new",sourceCondition:"new",targetCondition:null,unitCost:2500,note:null,reference:null,occurredAt:"30.09.2026 10:00",createdBy:actor.displayName,ownerUserId:object.ownerUserId??null,regionId:object.regionId??null,assigneeUserIds:object.assigneeUserIds??[]}];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<InventoryMovementRow>>`
      SELECT m.id,m.item_id "itemId",i.name item,m.variant,m.movement_type "movementType",m.quantity::numeric quantity,i.unit,
        m.from_location_id "fromLocationId",fl.name "fromLocation",m.to_location_id "toLocationId",tl.name "toLocation",
        m.worker_id "workerId",w.full_name worker,COALESCE(tl.object_id,fl.object_id,wa.object_id) "objectId",
        COALESCE(to_obj.name,from_obj.name,worker_obj.name) object,
        COALESCE(to_manager.display_name,from_manager.display_name,worker_manager.display_name) manager,
        m.item_condition condition,m.source_condition "sourceCondition",m.target_condition "targetCondition",m.unit_cost::numeric "unitCost",m.note,m.reference,
        to_char(m.occurred_at,'DD.MM.YYYY HH24:MI') "occurredAt",creator.display_name "createdBy",
        COALESCE(tl.responsible_user_id,fl.responsible_user_id,to_obj.owner_user_id,from_obj.owner_user_id,wa.manager_user_id,m.created_by_user_id) "ownerUserId",
        COALESCE(to_obj.region_id,from_obj.region_id,worker_obj.region_id) "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=COALESCE(tl.object_id,fl.object_id,wa.object_id) AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || ARRAY[m.created_by_user_id::text] "assigneeUserIds"
      FROM inventory_movements m
      JOIN inventory_items i ON i.id=m.item_id
      LEFT JOIN storage_locations fl ON fl.id=m.from_location_id
      LEFT JOIN storage_locations tl ON tl.id=m.to_location_id
      LEFT JOIN objects from_obj ON from_obj.id=fl.object_id
      LEFT JOIN objects to_obj ON to_obj.id=tl.object_id
      LEFT JOIN app_users from_manager ON from_manager.id=COALESCE(fl.responsible_user_id,from_obj.owner_user_id)
      LEFT JOIN app_users to_manager ON to_manager.id=COALESCE(tl.responsible_user_id,to_obj.owner_user_id)
      LEFT JOIN worker_profiles w ON w.id=m.worker_id
      LEFT JOIN LATERAL (
        SELECT x.object_id,x.manager_user_id FROM worker_object_assignments x
        WHERE x.worker_id=m.worker_id
        ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC LIMIT 1
      ) wa ON true
      LEFT JOIN objects worker_obj ON worker_obj.id=wa.object_id
      LEFT JOIN app_users worker_manager ON worker_manager.id=wa.manager_user_id
      JOIN app_users creator ON creator.id=m.created_by_user_id
      ORDER BY m.occurred_at DESC LIMIT 500
    `;
    return rows.filter(row=>canReadRow(actor.access,"assets.read",row,actor)).map(row=>({...row,quantity:Number(row.quantity),unitCost:row.unitCost==null?null:Number(row.unitCost)}));
  });
}

export async function listWorkerAssetHoldings(actor:Actor):Promise<WorkerAssetHoldingRow[]>{
  requireCapability(actor,"assets.read");
  if(actor.demo){
    const object=demoObjectFor(actor,"assets.read")??demo.objects[0];
    return demo.workers.filter(row=>row.objectId===object.id).slice(0,4).map((worker,index)=>({workerId:worker.id,worker:worker.fullName,objectId:object.id,object:object.name,manager:object.ownerName??null,itemId:index%2?"demo-item-boots":"demo-item-jacket",item:index%2?"Ботинки рабочие":"Куртка рабочая",variant:index%2?"43":"52",quantity:1,unit:index%2?"пар":"шт",returnable:true,lastIssuedAt:"30.09.2026",replacementCycleDays:180,nextReplacementAt:"29.03.2027",ownerUserId:object.ownerUserId??null,regionId:object.regionId??null,assigneeUserIds:object.assigneeUserIds??[]}));
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<Array<WorkerAssetHoldingRow>>`
      SELECT w.id "workerId",w.full_name worker,a.object_id "objectId",o.name object,manager.display_name manager,
        i.id "itemId",i.name item,m.variant,
        sum(CASE WHEN m.movement_type='issue' THEN m.quantity
                 WHEN m.movement_type='return' THEN -m.quantity
                 WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity
                 ELSE 0 END)::numeric quantity,
        i.unit,i.returnable,to_char(max(m.occurred_at) FILTER (WHERE m.movement_type='issue'),'DD.MM.YYYY') "lastIssuedAt",
        i.default_replacement_cycle_days "replacementCycleDays",
        CASE WHEN i.default_replacement_cycle_days IS NULL THEN NULL ELSE
          to_char((max(m.occurred_at) FILTER (WHERE m.movement_type='issue'))::date+i.default_replacement_cycle_days,'DD.MM.YYYY') END "nextReplacementAt",
        COALESCE(a.manager_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM inventory_movements m
      JOIN inventory_items i ON i.id=m.item_id
      JOIN worker_profiles w ON w.id=m.worker_id
      LEFT JOIN LATERAL (
        SELECT x.object_id,x.manager_user_id FROM worker_object_assignments x
        WHERE x.worker_id=w.id
        ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC LIMIT 1
      ) a ON true
      LEFT JOIN objects o ON o.id=a.object_id
      LEFT JOIN app_users manager ON manager.id=COALESCE(a.manager_user_id,o.owner_user_id)
      GROUP BY w.id,w.full_name,a.object_id,o.name,manager.display_name,i.id,i.name,i.unit,i.returnable,i.default_replacement_cycle_days,m.variant,a.manager_user_id,o.owner_user_id,o.region_id
      HAVING sum(CASE WHEN m.movement_type='issue' THEN m.quantity
                      WHEN m.movement_type='return' THEN -m.quantity
                      WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity
                      ELSE 0 END)>0
      ORDER BY w.full_name,i.name,m.variant
    `;
    return rows.filter(row=>canReadRow(actor.access,"assets.read",row,actor)).map(row=>({...row,quantity:Number(row.quantity)}));
  });
}
