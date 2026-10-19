import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";
import {requireObjectScope,resolveObjectConditionInTransaction,conditionScheduleParts} from "@/lib/operations/object-conditions";
const schema=z.object({objectId:z.string().uuid(),specialtyId:z.string().uuid(),shiftKind:z.enum(["day","night","mixed"]),date:z.string().date().nullable()});
export async function GET(request:Request){
 try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
 const q=new URL(request.url).searchParams;const input=schema.parse({objectId:q.get('objectId'),specialtyId:q.get('specialtyId'),shiftKind:q.get('shiftKind')??'mixed',date:q.get('date')||null});
 await requireObjectScope(actor,input.objectId,'operations.shift.edit');
 if(actor.demo)return NextResponse.json({condition:null,demo:true});
 const condition=await withTenant(actor.organizationId,actor.userId,sql=>resolveObjectConditionInTransaction(sql,actor.organizationId,input));
 return NextResponse.json({condition,schedule:conditionScheduleParts(condition)});
 }catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:'Проверьте объект и специальность'},{status:400});if(e instanceof AccessDeniedError)return NextResponse.json({error:'Недостаточно прав'},{status:403});console.error(e);return NextResponse.json({error:'Не удалось прочитать условия графика'},{status:500})}
}
