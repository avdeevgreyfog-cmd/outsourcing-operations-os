import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const status=z.enum(["missing","requested","received","verified","rejected","not_required","to_prepare","in_progress","ready"]);
const patchSchema=z.object({
  applicationId:z.string().uuid(),
  documentTypeId:z.string().uuid(),
  status,
  note:z.string().trim().max(1000).nullable().optional(),
  responsibleUserId:z.string().uuid().nullable().optional(),
  dueAt:z.string().datetime().nullable().optional(),
});

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.candidate.read");
    const {id}=await params;const applicationId=new URL(request.url).searchParams.get("applicationId");
    if(!applicationId)return NextResponse.json({error:"Не указана заявка кандидата"},{status:400});
    if(actor.demo)return NextResponse.json({items:[]});
    const items=await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [row]=await sql<Array<{id:string;candidateId:string;ownerUserId:string|null;managerUserId:string|null;objectId:string|null;regionId:string|null;clientId:string|null;assigneeUserIds:string[]}>>`
        SELECT ca.id,ca.candidate_id "candidateId",ca.owner_user_id "ownerUserId",ca.manager_user_id "managerUserId",ca.object_id "objectId",
          COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
          ARRAY[ca.owner_user_id::text,ca.manager_user_id::text] || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL) "assigneeUserIds"
        FROM candidate_applications ca JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
        WHERE ca.id=${applicationId}::uuid AND ca.candidate_id=${id}::uuid
      `;
      if(!row||!canReadRow(actor.access,"recruiting.candidate.read",row,actor))throw new AccessDeniedError("recruiting.candidate.read");
      return sql<Array<{documentTypeId:string;name:string;groupType:"employment"|"clearance";provider:"candidate"|"company"|"client";status:string;note:string|null;requiredByStage:string;blocksProgress:boolean;responsibleUserId:string|null;responsible:string|null;dueAt:string|null}>>`
        SELECT dt.id "documentTypeId",dt.name,dt.group_type "groupType",ndr.provider,ndr.required_by_stage "requiredByStage",ndr.blocks_progress "blocksProgress",
          cad.responsible_user_id "responsibleUserId",ru.display_name responsible,cad.due_at::text "dueAt",
          CASE WHEN dt.group_type='employment'
            THEN COALESCE(cd.status,cad.status,'missing')
            ELSE COALESCE(cad.status,CASE WHEN ndr.provider='candidate' THEN 'missing' ELSE 'to_prepare' END)
          END status,
          CASE WHEN dt.group_type='employment' THEN COALESCE(cd.note,cad.note) ELSE cad.note END note
        FROM need_document_requirements ndr
        JOIN candidate_applications ca ON ca.need_id=ndr.need_id AND ca.id=${applicationId}::uuid
        JOIN recruiting_document_types dt ON dt.id=ndr.document_type_id
        LEFT JOIN candidate_documents cd ON cd.candidate_id=ca.candidate_id AND cd.document_type_id=dt.id
        LEFT JOIN candidate_application_documents cad ON cad.application_id=ca.id AND cad.document_type_id=dt.id
        LEFT JOIN app_users ru ON ru.id=cad.responsible_user_id
        WHERE ndr.required
        ORDER BY CASE dt.group_type WHEN 'employment' THEN 1 ELSE 2 END,dt.sort_order,dt.name
      `;
    });
    return NextResponse.json({items});
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось загрузить документы"},{status:500});
  }
}

async function syncDocumentTask(tx:Sql,actor:{organizationId:string;userId:string},row:{id:string;candidateId:string},documentTypeId:string,documentName:string,responsibleUserId:string|null|undefined,dueAt:string|null|undefined,status:string){
  const kind="candidate_document";
  const [existing]=await tx<Array<{id:string}>>`
    SELECT id FROM tasks
    WHERE organization_id=${actor.organizationId}::uuid AND entity_type='candidate_application' AND entity_id=${row.id}::uuid
      AND checklist_json->>'kind'=${kind} AND checklist_json->>'documentTypeId'=${documentTypeId}
      AND status<>'cancelled'
    ORDER BY created_at DESC LIMIT 1
  `;
  const done=["received","verified","ready","not_required"].includes(status);
  const enabled=Boolean(responsibleUserId&&dueAt)&&!["not_required","rejected"].includes(status);
  if(!enabled){
    if(existing)await tx`UPDATE tasks SET status=${done?"done":"cancelled"},updated_at=now() WHERE id=${existing.id}::uuid`;
    return;
  }
  const assigneeUserId=responsibleUserId as string;
  const deadline=dueAt as string;
  const [membership]=await tx<Array<{id:string}>>`SELECT id FROM organization_memberships WHERE organization_id=${actor.organizationId}::uuid AND user_id=${assigneeUserId}::uuid AND status='active'`;
  if(!membership)throw new Error("Ответственный по документу не является активным сотрудником организации");
  const title=`Подготовить документ: ${documentName}`;
  if(existing)await tx`UPDATE tasks SET title=${title},status=${done?"done":"open"},priority='high',assignee_user_id=${assigneeUserId}::uuid,due_at=${deadline}::timestamptz,updated_at=now() WHERE id=${existing.id}::uuid`;
  else await tx`
    INSERT INTO tasks(organization_id,title,status,priority,assignee_user_id,due_at,entity_type,entity_id,checklist_json,created_by_user_id)
    VALUES(${actor.organizationId}::uuid,${title},${done?"done":"open"},'high',${assigneeUserId}::uuid,${deadline}::timestamptz,'candidate_application',${row.id}::uuid,
      ${tx.json({kind,documentTypeId,candidateId:row.candidateId})},${actor.userId}::uuid)
  `;
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({error:"В демонстрационном режиме документы сохраняются локально"},{status:409});
    const {id}=await params;const body=patchSchema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [row]=await tx<Array<{id:string;candidateId:string;ownerUserId:string|null;managerUserId:string|null;objectId:string|null;regionId:string|null;clientId:string|null;assigneeUserIds:string[]}>>`
        SELECT ca.id,ca.candidate_id "candidateId",ca.owner_user_id "ownerUserId",ca.manager_user_id "managerUserId",ca.object_id "objectId",
          COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
          ARRAY[ca.owner_user_id::text,ca.manager_user_id::text] || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL) "assigneeUserIds"
        FROM candidate_applications ca JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
        WHERE ca.id=${body.applicationId}::uuid AND ca.candidate_id=${id}::uuid
      `;
      if(!row||!canReadRow(actor.access,"recruiting.candidate.edit",row,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      const [requirement]=await tx<Array<{provider:string;name:string;groupType:"employment"|"clearance"}>>`
        SELECT ndr.provider,dt.name,dt.group_type "groupType" FROM candidate_applications ca
        JOIN need_document_requirements ndr ON ndr.need_id=ca.need_id AND ndr.document_type_id=${body.documentTypeId}::uuid
        JOIN recruiting_document_types dt ON dt.id=ndr.document_type_id
        WHERE ca.id=${body.applicationId}::uuid AND ndr.required
      `;
      if(!requirement)throw new Error("Документ не входит в требования потребности");
      if(requirement.groupType==="employment"){
        await tx`
          INSERT INTO candidate_documents(organization_id,candidate_id,document_type_id,status,note,updated_by_user_id)
          VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.documentTypeId}::uuid,${body.status},${body.note??null},${actor.userId}::uuid)
          ON CONFLICT(candidate_id,document_type_id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
        `;
      }else{
        await tx`
          INSERT INTO candidate_application_documents(organization_id,application_id,document_type_id,status,note,responsible_user_id,due_at,updated_by_user_id)
          VALUES(${actor.organizationId}::uuid,${body.applicationId}::uuid,${body.documentTypeId}::uuid,${body.status},${body.note??null},${body.responsibleUserId??null}::uuid,${body.dueAt??null}::timestamptz,${actor.userId}::uuid)
          ON CONFLICT(application_id,document_type_id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,responsible_user_id=EXCLUDED.responsible_user_id,due_at=EXCLUDED.due_at,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
        `;
        if(requirement.provider!=="candidate"||body.responsibleUserId||body.dueAt){
          await syncDocumentTask(tx,actor,row,body.documentTypeId,requirement.name,body.responsibleUserId,body.dueAt,body.status);
        }
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${id}::uuid,'document_updated',
          ${`Документ «${requirement.name}»: ${body.status}`},
          ${sql.json({applicationId:body.applicationId,documentTypeId:body.documentTypeId,status:body.status,provider:requirement.provider})})
      `;
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте статус документа",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить документ"},{status:500});
  }
}
