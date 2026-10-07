import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";
import {calculateTenderBidEconomics} from "@/lib/tenders/trading.mjs";

const bodySchema=z.object({
  bidValue:z.number().positive().max(99999999999999),
  priceVatMode:z.enum(["unknown","with_vat","without_vat","not_applicable"]),
  occurredAt:z.string().datetime({offset:true}).nullable().optional(),
  reference:z.string().trim().max(500).nullable().optional(),
  note:z.string().trim().max(5000).nullable().optional(),
});
type ScopeRow={organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;clientId:string|null;stage:string};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"sales.tender.edit");
    requireCapability(actor,"sales.tender.submit");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=bodySchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async tx=>{
      const [scope]=await tx<Array<ScopeRow>>`
        SELECT organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",
          assigned_team_id "teamId",region_id "regionId",client_company_id "clientId",stage
        FROM tenders WHERE id=${id}::uuid FOR UPDATE
      `;
      if(!scope)throw new Error("Тендер не найден");
      if(!canReadRow(actor.access,"sales.tender.edit",scope,actor))throw new AccessDeniedError("sales.tender.edit");
      if(!["submitted","awaiting_result"].includes(scope.stage))throw new Error("Раунды торгов можно фиксировать после подачи и до завершения тендера");

      const economics=await calculateTenderBidEconomics(tx,id,body.bidValue,body.priceVatMode);
      const [counter]=await tx<Array<{nextRound:number}>>`
        SELECT COALESCE(max(round_number),0)::int+1 "nextRound"
        FROM tender_bid_rounds WHERE tender_id=${id}::uuid
      `;
      const roundNumber=counter?.nextRound??1;
      const [row]=await tx<Array<{id:string;roundNumber:number;bidValue:number|string;occurredAt:string}>>`
        INSERT INTO tender_bid_rounds(
          organization_id,tender_id,round_number,bid_value,price_vat_mode,occurred_at,source,
          reference,note,economics_snapshot,recorded_by_user_id
        ) VALUES(
          ${actor.organizationId}::uuid,${id}::uuid,${roundNumber},${body.bidValue},${body.priceVatMode},
          COALESCE(${body.occurredAt??null}::timestamptz,now()),'auction',
          ${body.reference??null},${body.note??null},${tx.json(economics)},${actor.userId}::uuid
        )
        RETURNING id,round_number "roundNumber",bid_value "bidValue",occurred_at::text "occurredAt"
      `;
      await tx`UPDATE tenders SET final_bid_value=${body.bidValue},updated_at=now() WHERE id=${id}::uuid`;
      const amount=new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(body.bidValue);
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'tender',${id}::uuid,'bid_round_added',${`Зафиксирован раунд торгов №${roundNumber}: ${amount}`})
      `;
      return row;
    });
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры раунда торгов",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
