import { NextResponse } from "next/server";
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
      return sql<Array<{documentTypeId:string;name:string;groupType:"employment"|"clearance";provider:"candidate"|"company"|"client";status:string;note:string|null;requiredByStage:string;blocksProgress:boolean}>>`
        SELECT dt.id "documentTypeId",dt.name,dt.group_type "groupType",ndr.provider,ndr.required_by_stage "requiredByStage",ndr.blocks_progress "blocksProgress",
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
          INSERT INTO candidate_application_documents(organization_id,application_id,document_type_id,status,note,updated_by_user_id)
          VALUES(${actor.organizationId}::uuid,${body.applicationId}::uuid,${body.documentTypeId}::uuid,${body.status},${body.note??null},${actor.userId}::uuid)
          ON CONFLICT(application_id,document_type_id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
        `;
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
