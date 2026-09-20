import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

export async function GET(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.create");
    if(actor.demo)return NextResponse.json({exact:[],possible:[]});

    const url=new URL(request.url);
    const phone=url.searchParams.get("phone")?.trim()??"";
    const email=url.searchParams.get("email")?.trim()??"";
    const telegram=url.searchParams.get("telegram")?.trim()??"";
    const whatsapp=url.searchParams.get("whatsapp")?.trim()??"";
    const max=url.searchParams.get("max")?.trim()??"";
    const fullName=url.searchParams.get("fullName")?.trim()??"";
    const city=url.searchParams.get("city")?.trim()??"";
    const contactValues=[
      ...(phone?[{channel:"phone",value:phone}]:[]),
      ...(email?[{channel:"email",value:email}]:[]),
      ...(telegram?[{channel:"telegram",value:telegram}]:[]),
      ...(whatsapp?[{channel:"whatsapp",value:whatsapp}]:[]),
      ...(max?[{channel:"max",value:max}]:[]),
    ];
    if(!contactValues.length&&fullName.length<3)return NextResponse.json({exact:[],possible:[]});

    const rows=await withTenant(actor.organizationId,actor.userId,sql=>sql<Array<{
      id:string;fullName:string;phone:string|null;city:string|null;status:string;
      ownerUserId:string|null;managerUserId:string|null;objectId:string|null;regionId:string|null;clientId:string|null;assigneeUserIds:string[];
      need:string|null;object:string|null;stage:string|null;exact:boolean;
    }>>\`
      SELECT c.id,c.full_name "fullName",c.phone,c.city,c.status,
        latest.owner_user_id "ownerUserId",latest.manager_user_id "managerUserId",latest.object_id "objectId",
        COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
        ARRAY[latest.owner_user_id::text,latest.manager_user_id::text]
          || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=latest.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL) "assigneeUserIds",
        COALESCE(n.title,s.name) need,o.name object,latest.stage,
        (
          (\${phone||null} IS NOT NULL AND regexp_replace(COALESCE(c.phone,''),'\\\\D','','g')=regexp_replace(\${phone},'\\\\D','','g'))
          OR (\${email||null} IS NOT NULL AND lower(COALESCE(c.email,''))=lower(\${email}))
          OR EXISTS(
            SELECT 1 FROM candidate_contact_methods cm
            JOIN jsonb_to_recordset(\${sql.json(contactValues)}::jsonb) AS x(channel text,value text) ON cm.channel=x.channel
            WHERE cm.candidate_id=c.id AND cm.active AND (
              (x.channel IN ('phone','whatsapp','max') AND regexp_replace(cm.value,'\\\\D','','g')=regexp_replace(x.value,'\\\\D','','g'))
              OR (x.channel NOT IN ('phone','whatsapp','max') AND lower(cm.value)=lower(x.value))
            )
          )
        ) exact
      FROM candidates c
      LEFT JOIN LATERAL(
        SELECT ca.* FROM candidate_applications ca WHERE ca.candidate_id=c.id ORDER BY ca.updated_at DESC LIMIT 1
      ) latest ON true
      LEFT JOIN needs n ON n.id=latest.need_id
      LEFT JOIN specialties s ON s.id=n.specialty_id
      LEFT JOIN objects o ON o.id=latest.object_id
      WHERE (
        \${contactValues.length>0} AND (
          (\${phone||null} IS NOT NULL AND regexp_replace(COALESCE(c.phone,''),'\\\\D','','g')=regexp_replace(\${phone},'\\\\D','','g'))
          OR (\${email||null} IS NOT NULL AND lower(COALESCE(c.email,''))=lower(\${email}))
          OR EXISTS(
            SELECT 1 FROM candidate_contact_methods cm
            JOIN jsonb_to_recordset(\${sql.json(contactValues)}::jsonb) AS x(channel text,value text) ON cm.channel=x.channel
            WHERE cm.candidate_id=c.id AND cm.active AND (
              (x.channel IN ('phone','whatsapp','max') AND regexp_replace(cm.value,'\\\\D','','g')=regexp_replace(x.value,'\\\\D','','g'))
              OR (x.channel NOT IN ('phone','whatsapp','max') AND lower(cm.value)=lower(x.value))
            )
          )
        )
      ) OR (
        \${fullName.length>=3} AND lower(regexp_replace(c.full_name,'\\\\s+',' ','g'))=lower(regexp_replace(\${fullName},'\\\\s+',' ','g'))
        AND (\${city||null} IS NULL OR lower(COALESCE(c.city,''))=lower(\${city}))
      )
      ORDER BY exact DESC,c.updated_at DESC LIMIT 8
    \`);
    const visible=rows.filter(row=>canReadRow(actor.access,"recruiting.candidate.read",row,actor));
    const shape=(row:(typeof rows)[number])=>({id:row.id,fullName:row.fullName,phone:row.phone,city:row.city,status:row.status,need:row.need,object:row.object,stage:row.stage});
    return NextResponse.json({exact:visible.filter(row=>row.exact).map(shape),possible:visible.filter(row=>!row.exact).map(shape)});
  }catch(error){
    console.error(error);
    return NextResponse.json({error:"Не удалось проверить дубли"},{status:500});
  }
}
