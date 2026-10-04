import crypto from "node:crypto";
import type { Sql } from "postgres";
import { db } from "@/lib/db/client";

export type PublicRequestTokenKind="request_public_link"|"request_intake_link";

export function hashPublicRequestToken(token:string){
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function registerPublicRequestToken(
  sql:Sql,
  token:string,
  tenantId:string,
  actorUserId:string,
  kind:PublicRequestTokenKind,
  linkId:string,
){
  await sql`
    INSERT INTO public_request_token_directory(token_hash,tenant_id,actor_user_id,link_kind,link_id)
    VALUES(${hashPublicRequestToken(token)},${tenantId}::uuid,${actorUserId}::uuid,${kind},${linkId}::uuid)
    ON CONFLICT(token_hash) DO UPDATE SET
      tenant_id=EXCLUDED.tenant_id,
      actor_user_id=EXCLUDED.actor_user_id,
      link_kind=EXCLUDED.link_kind,
      link_id=EXCLUDED.link_id
  `;
}

export async function resolvePublicRequestToken(token:string,kind:PublicRequestTokenKind){
  const [row]=await db()<Array<{tenantId:string;actorUserId:string;linkId:string}>>`
    SELECT tenant_id "tenantId",actor_user_id "actorUserId",link_id "linkId"
    FROM public_request_token_directory
    WHERE token_hash=${hashPublicRequestToken(token)} AND link_kind=${kind}
    LIMIT 1
  `;
  return row??null;
}
