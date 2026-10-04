import type {Actor} from "@/lib/access/types";
import {listWorkers} from "@/lib/data/service";
import {withTenant} from "@/lib/db/client";
import {workerContactSchema,type WorkerProfile} from "./worker-profile-schema";

export async function getWorkerProfile(actor:Actor,workerId:string):Promise<WorkerProfile|null>{
  const worker=(await listWorkers(actor)).find(row=>row.id===workerId);
  if(!worker)return null;
  if(actor.demo)return {fullName:worker.fullName,phone:worker.phone??null,email:null,contacts:[],revision:"demo",additionalContactsReady:true};
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [schema]=await sql<Array<{ready:boolean}>>`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='worker_profiles' AND column_name='contact_methods') ready`;
    const [profile]=await sql<Array<{fullName:string;phone:string|null;email:string|null;contacts:unknown;revision:string;originCandidateId:string|null}>>`
      SELECT full_name "fullName",phone,email,updated_at::text revision,origin_candidate_id "originCandidateId",
        ${schema.ready?sql`contact_methods`:sql`NULL::jsonb`} contacts
      FROM worker_profiles WHERE organization_id=${actor.organizationId}::uuid AND id=${workerId}::uuid
    `;
    if(!profile)return null;
    if(profile.contacts===null&&profile.originCandidateId){
      profile.contacts=await sql`SELECT channel,value,COALESCE(label,'') label FROM candidate_contact_methods WHERE candidate_id=${profile.originCandidateId}::uuid AND organization_id=${actor.organizationId}::uuid AND active ORDER BY is_preferred DESC,created_at,id`;
    }
    const contacts=Array.isArray(profile.contacts)?profile.contacts.flatMap(contact=>{const parsed=workerContactSchema.safeParse(contact);return parsed.success&&!(parsed.data.channel==="phone"&&parsed.data.value.replace(/\D/g,"")===profile.phone?.replace(/\D/g,""))&&!(parsed.data.channel==="email"&&parsed.data.value.toLowerCase()===profile.email?.toLowerCase())?[parsed.data]:[]}):[];
    return {fullName:profile.fullName,phone:profile.phone,email:profile.email,revision:profile.revision,contacts,additionalContactsReady:schema.ready};
  });
}
