import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type HousingObjectLinkRow={
  objectId:string;object:string;managerId:string|null;manager:string|null;regionId:string|null;relationType:"primary"|"service";assigneeUserIds:string[];
};
export type HousingControlSiteRow={
  id:string;organizationId:string;name:string;siteType:string;address:string|null;vendor:string|null;partnerId:string|null;partner:string|null;
  contactName:string|null;contactPhone:string|null;checkInRules:string|null;checkOutRules:string|null;notes:string|null;
  responsibleUserId:string|null;responsible:string|null;objectLinks:HousingObjectLinkRow[];
  capacity:number;occupied:number;plannedArrivals:number;plannedDepartures:number;projectedOccupied:number;
};
export type HousingControlStayRow={
  id:string;organizationId:string;workerId:string;worker:string;workerStatus:string;objectId:string|null;object:string|null;manager:string|null;
  siteId:string;site:string;unitId:string|null;unit:string|null;bedLabel:string|null;
  checkIn:string;actualCheckIn:string|null;plannedCheckOut:string|null;actualCheckOut:string|null;status:string;
  exitProcessId:string|null;exitStatus:string|null;exitDate:string|null;checkoutNote:string|null;
};
export type HousingUnitControlRow={
  id:string;siteId:string;name:string;unitType:string;capacity:number;notes:string|null;active:boolean;
  occupied:number;plannedArrivals:number;plannedDepartures:number;
};
export type HousingDocumentRow={
  id:string;siteId:string;contractId:string|null;name:string;category:string;documentNumber:string|null;documentDate:string|null;
  sourceUrl:string|null;validFrom:string|null;expiresAt:string|null;status:string;notes:string|null;createdBy:string;updatedAt:string;
};
export type HousingPaymentRow={
  id:string;siteId:string;contractId:string;objectId:string;object:string;amount:number;expenseDate:string;vendor:string|null;reference:string|null;createdBy:string;
};
export type HousingActivityRow={id:string;siteId:string;actor:string;verb:string;summary:string;createdAt:string};
export type HousingControlSnapshot={
  sites:HousingControlSiteRow[];stays:HousingControlStayRow[];units:HousingUnitControlRow[];
  documents:HousingDocumentRow[];payments:HousingPaymentRow[];history:HousingActivityRow[];
};

function demoHousing(actor:Actor):HousingControlSnapshot{
  const object=demo.objects.find(row=>canReadRow(actor.access,"supply.housing.read",row,actor))??demo.objects[0];
  const workers=demo.workers.filter(row=>row.objectId===object.id).slice(0,3);
  const link:HousingObjectLinkRow={objectId:object.id,object:object.name,managerId:object.ownerUserId??null,manager:object.ownerName??null,regionId:object.regionId??null,relationType:"primary",assigneeUserIds:object.assigneeUserIds??[]};
  const sites:HousingControlSiteRow[]=[{id:"demo-housing-1",organizationId:actor.organizationId,name:"Общежитие рядом с объектом",siteType:"dormitory",address:"Демо-адрес",vendor:"Демо-поставщик",partnerId:"demo-partner-housing",partner:"Хостел Профи",contactName:"Администратор",contactPhone:"+7 900 000-00-01",checkInRules:"Заселение до 22:00",checkOutRules:"Выселение до 12:00",notes:null,responsibleUserId:object.ownerUserId??null,responsible:object.ownerName??null,objectLinks:[link],capacity:6,occupied:workers.length,plannedArrivals:1,plannedDepartures:1,projectedOccupied:workers.length}];
  const stays:HousingControlStayRow[]=workers.map((worker,index)=>({id:"demo-stay-"+(index+1),organizationId:actor.organizationId,workerId:worker.id,worker:worker.fullName,workerStatus:worker.status,objectId:object.id,object:object.name,manager:object.ownerName??null,siteId:"demo-housing-1",site:"Общежитие рядом с объектом",unitId:"demo-room-1",unit:"Комната 1",bedLabel:String(index+1),checkIn:"01.09.2026",actualCheckIn:"01.09.2026",plannedCheckOut:index===0?"10.10.2026":null,actualCheckOut:null,status:"active",exitProcessId:index===0?"demo-exit":null,exitStatus:index===0?"planned":null,exitDate:index===0?"09.10.2026":null,checkoutNote:null}));
  return {
    sites,stays,
    units:[{id:"demo-room-1",siteId:"demo-housing-1",name:"Комната 1",unitType:"room",capacity:4,notes:null,active:true,occupied:Math.min(3,workers.length),plannedArrivals:0,plannedDepartures:1},{id:"demo-room-2",siteId:"demo-housing-1",name:"Комната 2",unitType:"room",capacity:2,notes:null,active:true,occupied:Math.max(0,workers.length-3),plannedArrivals:1,plannedDepartures:0}],
    documents:[{id:"demo-doc-1",siteId:"demo-housing-1",contractId:"demo-housing-contract",name:"Договор на размещение",category:"contract",documentNumber:"12/26",documentDate:"01.09.2026",sourceUrl:null,validFrom:"01.09.2026",expiresAt:"31.12.2026",status:"active",notes:null,createdBy:actor.displayName,updatedAt:"01.09.2026"}],
    payments:[{id:"demo-payment-1",siteId:"demo-housing-1",contractId:"demo-housing-contract",objectId:object.id,object:object.name,amount:54000,expenseDate:"25.09.2026",vendor:"Хостел Профи",reference:"Договор 12/26",createdBy:actor.displayName}],
    history:[{id:"demo-history-1",siteId:"demo-housing-1",actor:actor.displayName,verb:"payment_recorded",summary:"Зафиксирована оплата жилья 54 000 ₽",createdAt:"25.09.2026 12:00"}],
  };
}

export async function getHousingControlSnapshot(actor:Actor):Promise<HousingControlSnapshot>{
  requireCapability(actor,"supply.housing.read");
  if(actor.demo)return demoHousing(actor);
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rawSites=await sql<Array<HousingControlSiteRow & {primaryObjectId:string|null;primaryOwnerUserId:string|null;primaryRegionId:string|null;siteAssigneeUserIds:string[]}>>`
      SELECT hs.id,hs.organization_id "organizationId",hs.name,hs.site_type "siteType",hs.address_text address,hs.vendor,
        hs.partner_id "partnerId",sp.name partner,hs.contact_name "contactName",hs.contact_phone "contactPhone",
        hs.check_in_rules "checkInRules",hs.check_out_rules "checkOutRules",hs.notes,
        hs.responsible_user_id "responsibleUserId",responsible.display_name responsible,
        hs.primary_object_id "primaryObjectId",po.owner_user_id "primaryOwnerUserId",po.region_id "primaryRegionId",
        COALESCE(links.items,'[]'::jsonb) "objectLinks",
        COALESCE(links.assignees,ARRAY[]::text[])
          || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "siteAssigneeUserIds",
        COALESCE(units.capacity,0)::int capacity,
        COALESCE(stays.occupied,0)::int occupied,
        COALESCE(stays.planned_arrivals,0)::int "plannedArrivals",
        COALESCE(stays.planned_departures,0)::int "plannedDepartures",
        GREATEST(COALESCE(stays.occupied,0)+COALESCE(stays.planned_arrivals,0)-COALESCE(stays.planned_departures,0),0)::int "projectedOccupied"
      FROM housing_sites hs
      LEFT JOIN supply_partners sp ON sp.id=hs.partner_id
      LEFT JOIN objects po ON po.id=hs.primary_object_id
      LEFT JOIN app_users responsible ON responsible.id=hs.responsible_user_id
      LEFT JOIN LATERAL (
        SELECT
          jsonb_agg(jsonb_build_object(
            'objectId',o.id,'object',o.name,'managerId',o.owner_user_id,'manager',manager.display_name,
            'regionId',o.region_id,'relationType',hso.relation_type,
            'assigneeUserIds',COALESCE(assignments.ids,ARRAY[]::text[])
          ) ORDER BY (hso.relation_type='primary') DESC,o.name) items,
          COALESCE(array_agg(DISTINCT owner_id) FILTER (WHERE owner_id IS NOT NULL),ARRAY[]::text[])
            || COALESCE(array_agg(DISTINCT assignee_id) FILTER (WHERE assignee_id IS NOT NULL),ARRAY[]::text[]) assignees
        FROM housing_site_objects hso
        JOIN objects o ON o.id=hso.object_id
        LEFT JOIN app_users manager ON manager.id=o.owner_user_id
        LEFT JOIN LATERAL (
          SELECT array_agg(oa.user_id::text) ids
          FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)
        ) assignments ON true
        LEFT JOIN LATERAL unnest(COALESCE(assignments.ids,ARRAY[]::text[])) assignee(assignee_id) ON true
        LEFT JOIN LATERAL (SELECT o.owner_user_id::text owner_id) owner ON true
        WHERE hso.site_id=hs.id AND hso.active
      ) links ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(hu.capacity),0)::int capacity
        FROM housing_units hu WHERE hu.site_id=hs.id AND hu.active
      ) units ON true
      LEFT JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE st.status='active' AND st.check_in<=current_date AND st.actual_check_out IS NULL)::int occupied,
          count(*) FILTER (WHERE st.status='planned' AND st.check_in>current_date)::int planned_arrivals,
          count(*) FILTER (WHERE st.status='active' AND st.actual_check_out IS NULL AND st.planned_check_out>=current_date)::int planned_departures
        FROM housing_stays st WHERE st.site_id=hs.id
      ) stays ON true
      WHERE hs.active
      ORDER BY hs.name
    `;

    const sites=rawSites.filter(row=>{
      const base={organizationId:row.organizationId,objectId:row.primaryObjectId??undefined,ownerUserId:row.responsibleUserId??row.primaryOwnerUserId??undefined,regionId:row.primaryRegionId??undefined,assigneeUserIds:row.siteAssigneeUserIds};
      if(canReadRow(actor.access,"supply.housing.read",base,actor))return true;
      return row.objectLinks.some(link=>canReadRow(actor.access,"supply.housing.read",{organizationId:row.organizationId,objectId:link.objectId,ownerUserId:link.managerId??undefined,regionId:link.regionId??undefined,assigneeUserIds:link.assigneeUserIds},actor));
    }).map(row=>({
      id:row.id,organizationId:row.organizationId,name:row.name,siteType:row.siteType,address:row.address,vendor:row.vendor,partnerId:row.partnerId,partner:row.partner,
      contactName:row.contactName,contactPhone:row.contactPhone,checkInRules:row.checkInRules,checkOutRules:row.checkOutRules,notes:row.notes,
      responsibleUserId:row.responsibleUserId,responsible:row.responsible,objectLinks:row.objectLinks??[],
      capacity:Number(row.capacity),occupied:Number(row.occupied),plannedArrivals:Number(row.plannedArrivals),plannedDepartures:Number(row.plannedDepartures),projectedOccupied:Number(row.projectedOccupied),
    }));
    const siteIds=sites.map(row=>row.id);
    if(!siteIds.length)return {sites,stays:[],units:[],documents:[],payments:[],history:[]};

    const [stays,units,documents,payments,history]=await Promise.all([
      sql<HousingControlStayRow[]>`
        SELECT st.id,st.organization_id "organizationId",st.worker_id "workerId",w.full_name worker,w.status "workerStatus",
          st.object_id "objectId",o.name object,manager.display_name manager,st.site_id "siteId",hs.name site,
          st.unit_id "unitId",hu.name unit,st.bed_label "bedLabel",to_char(st.check_in,'DD.MM.YYYY') "checkIn",
          to_char(st.actual_check_in,'DD.MM.YYYY') "actualCheckIn",to_char(st.planned_check_out,'DD.MM.YYYY') "plannedCheckOut",
          to_char(st.actual_check_out,'DD.MM.YYYY') "actualCheckOut",st.status,st.exit_process_id "exitProcessId",
          ep.status "exitStatus",to_char(ep.effective_date,'DD.MM.YYYY') "exitDate",st.checkout_note "checkoutNote"
        FROM housing_stays st
        JOIN worker_profiles w ON w.id=st.worker_id
        JOIN housing_sites hs ON hs.id=st.site_id
        LEFT JOIN housing_units hu ON hu.id=st.unit_id
        LEFT JOIN objects o ON o.id=st.object_id
        LEFT JOIN app_users manager ON manager.id=o.owner_user_id
        LEFT JOIN worker_exit_processes ep ON ep.id=st.exit_process_id
        WHERE st.site_id=ANY(${siteIds}::uuid[])
        ORDER BY st.status='active' DESC,st.status='planned' DESC,st.check_in DESC,w.full_name
      `,
      sql<HousingUnitControlRow[]>`
        SELECT hu.id,hu.site_id "siteId",hu.name,hu.unit_type "unitType",hu.capacity,hu.notes,hu.active,
          count(*) FILTER (WHERE st.status='active' AND st.check_in<=current_date AND st.actual_check_out IS NULL)::int occupied,
          count(*) FILTER (WHERE st.status='planned' AND st.check_in>current_date)::int "plannedArrivals",
          count(*) FILTER (WHERE st.status='active' AND st.actual_check_out IS NULL AND st.planned_check_out>=current_date)::int "plannedDepartures"
        FROM housing_units hu
        LEFT JOIN housing_stays st ON st.unit_id=hu.id
        WHERE hu.site_id=ANY(${siteIds}::uuid[])
        GROUP BY hu.id
        ORDER BY hu.site_id,hu.active DESC,hu.name
      `,
      sql<HousingDocumentRow[]>`
        SELECT d.id,d.site_id "siteId",d.contract_id "contractId",d.name,d.category,d.document_number "documentNumber",
          to_char(d.document_date,'DD.MM.YYYY') "documentDate",d.source_url "sourceUrl",
          to_char(d.valid_from,'DD.MM.YYYY') "validFrom",to_char(d.expires_at,'DD.MM.YYYY') "expiresAt",
          d.status,d.notes,creator.display_name "createdBy",to_char(d.updated_at,'DD.MM.YYYY HH24:MI') "updatedAt"
        FROM housing_documents d
        JOIN app_users creator ON creator.id=d.created_by_user_id
        WHERE d.site_id=ANY(${siteIds}::uuid[])
        ORDER BY d.status='archived',d.expires_at NULLS LAST,d.created_at DESC
      `,
      sql<HousingPaymentRow[]>`
        SELECT e.id,hc.site_id "siteId",e.housing_contract_id "contractId",e.object_id "objectId",o.name object,
          e.amount::numeric amount,to_char(e.expense_date,'DD.MM.YYYY') "expenseDate",e.vendor,e.reference,creator.display_name "createdBy"
        FROM object_expenses e
        JOIN housing_contracts hc ON hc.id=e.housing_contract_id
        JOIN objects o ON o.id=e.object_id
        JOIN app_users creator ON creator.id=e.created_by_user_id
        WHERE hc.site_id=ANY(${siteIds}::uuid[]) AND e.plan_fact='fact'
        ORDER BY e.expense_date DESC,e.created_at DESC
      `,
      sql<HousingActivityRow[]>`
        SELECT ev.id,(ev.metadata->>'siteId')::uuid "siteId",u.display_name actor,ev.verb,ev.summary,
          to_char(ev.created_at,'DD.MM.YYYY HH24:MI') "createdAt"
        FROM activity_events ev
        JOIN app_users u ON u.id=ev.actor_user_id
        WHERE ev.metadata ? 'siteId' AND (ev.metadata->>'siteId')::uuid=ANY(${siteIds}::uuid[])
        ORDER BY ev.created_at DESC LIMIT 500
      `,
    ]);
    return {
      sites,stays,units,documents,
      payments:payments.map(row=>({...row,amount:Number(row.amount)})),
      history,
    };
  });
}
