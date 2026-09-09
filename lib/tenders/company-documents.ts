import type {Actor} from "@/lib/access/types";
import {requireCapability} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";

export type CompanyDocumentRow={id:string;name:string;category:string;status:string;legalEntityId:string|null;legalEntity:string|null;documentNumber:string|null;sourceUrl:string|null;validFrom:string|null;expiresAt:string|null;notes:string|null;usageCount:number;updatedAt:string};
const demo:CompanyDocumentRow[]=[
{id:"b1000000-0000-4000-8000-000000000001",name:"Устав ООО «Оперис Персонал»",category:"corporate",status:"active",legalEntityId:"31000000-0000-4000-8000-000000000001",legalEntity:"Оперис Персонал",documentNumber:null,sourceUrl:null,validFrom:"2025-01-01",expiresAt:null,notes:null,usageCount:2,updatedAt:"09.09.2026"},
{id:"b1000000-0000-4000-8000-000000000002",name:"Справка об отсутствии задолженности",category:"tax",status:"needs_update",legalEntityId:"31000000-0000-4000-8000-000000000001",legalEntity:"Оперис Персонал",documentNumber:null,sourceUrl:null,validFrom:"2026-07-01",expiresAt:"2026-09-30",notes:"Обновлять перед тендерами при необходимости",usageCount:1,updatedAt:"08.09.2026"},
{id:"b1000000-0000-4000-8000-000000000003",name:"Карточка организации",category:"corporate",status:"active",legalEntityId:"31000000-0000-4000-8000-000000000001",legalEntity:"Оперис Персонал",documentNumber:null,sourceUrl:null,validFrom:null,expiresAt:null,notes:null,usageCount:3,updatedAt:"01.09.2026"},
];
export async function listCompanyDocuments(actor:Actor):Promise<CompanyDocumentRow[]>{
  if(actor.demo)return demo;
  requireCapability(actor,"company.document.read");
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<CompanyDocumentRow[]>`
    SELECT d.id,d.name,d.category,d.status,d.legal_entity_id "legalEntityId",COALESCE(le.short_name,le.name) "legalEntity",d.document_number "documentNumber",d.source_url "sourceUrl",d.valid_from::text "validFrom",d.expires_at::text "expiresAt",d.notes,
      (SELECT count(*)::int FROM tender_document_requirements r WHERE r.company_document_id=d.id) "usageCount",to_char(d.updated_at,'DD.MM.YYYY') "updatedAt"
    FROM company_documents d LEFT JOIN legal_entities le ON le.id=d.legal_entity_id WHERE d.status<>'archived' ORDER BY d.status='missing' DESC,d.expires_at NULLS LAST,d.name
  `);
}
