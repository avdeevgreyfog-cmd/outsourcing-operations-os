import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

function normalizePhone(value:string){return value.replace(/\D/g,"");}
function normalizeHandle(value:string){return value.trim().replace(/^@/,"").toLocaleLowerCase("ru");}

export async function GET(request:Request){
  const actor=await getCurrentActor();
  if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
  requireCapability(actor,"recruiting.candidate.read");
  const url=new URL(request.url);
  const phone=(url.searchParams.get("phone")??"").trim();
  const email=(url.searchParams.get("email")??"").trim().toLowerCase();
  const fullName=(url.searchParams.get("fullName")??"").trim();
  const telegram=(url.searchParams.get("telegram")??"").trim();
  const max=(url.searchParams.get("max")??"").trim();
  if(!phone&&!email&&!fullName&&!telegram&&!max)return NextResponse.json({matches:[]});
  if(actor.demo)return NextResponse.json({matches:[]});

  const phoneNormalized=phone?normalizePhone(phone):"";
  const telegramNormalized=telegram?normalizeHandle(telegram):"";
  const maxNormalized=max?(max.startsWith("+")?normalizePhone(max):normalizeHandle(max)):"";
  const matches=await withTenant(actor.organizationId,actor.userId,sql=>sql<Array<{
    id:string;fullName:string;phone:string|null;email:string|null;city:string|null;status:string;matchReasons:string[];
  }>>\`
    SELECT c.id,c.full_name "fullName",c.phone,c.email,c.city,c.status,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN \${phoneNormalized}<>'' AND regexp_replace(COALESCE(c.phone,''),'\\D','','g')=\${phoneNormalized} THEN 'phone' END,
        CASE WHEN \${email}<>'' AND lower(COALESCE(c.email,''))=\${email} THEN 'email' END,
        CASE WHEN \${fullName}<>'' AND lower(btrim(c.full_name))=lower(btrim(\${fullName})) THEN 'full_name' END,
        CASE WHEN \${telegramNormalized}<>'' AND EXISTS(SELECT 1 FROM candidate_contacts cc WHERE cc.candidate_id=c.id AND cc.kind='telegram' AND cc.normalized_value=\${telegramNormalized}) THEN 'telegram' END,
        CASE WHEN \${maxNormalized}<>'' AND EXISTS(SELECT 1 FROM candidate_contacts cc WHERE cc.candidate_id=c.id AND cc.kind='max' AND cc.normalized_value=\${maxNormalized}) THEN 'max' END
      ],NULL) "matchReasons"
    FROM candidates c
    WHERE c.organization_id=\${actor.organizationId}::uuid
      AND (
        (\${phoneNormalized}<>'' AND regexp_replace(COALESCE(c.phone,''),'\\D','','g')=\${phoneNormalized})
        OR (\${email}<>'' AND lower(COALESCE(c.email,''))=\${email})
        OR (\${fullName}<>'' AND lower(btrim(c.full_name))=lower(btrim(\${fullName})))
        OR (\${telegramNormalized}<>'' AND EXISTS(SELECT 1 FROM candidate_contacts cc WHERE cc.candidate_id=c.id AND cc.kind='telegram' AND cc.normalized_value=\${telegramNormalized}))
        OR (\${maxNormalized}<>'' AND EXISTS(SELECT 1 FROM candidate_contacts cc WHERE cc.candidate_id=c.id AND cc.kind='max' AND cc.normalized_value=\${maxNormalized}))
      )
    ORDER BY
      CASE WHEN \${phoneNormalized}<>'' AND regexp_replace(COALESCE(c.phone,''),'\\D','','g')=\${phoneNormalized} THEN 0
           WHEN \${email}<>'' AND lower(COALESCE(c.email,''))=\${email} THEN 1 ELSE 2 END,
      c.updated_at DESC
    LIMIT 8
  \`);
  return NextResponse.json({matches});
}
