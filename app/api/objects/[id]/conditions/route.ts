import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError} from "@/lib/access/server";
import {conditionSchema,listObjectConditions,saveObjectCondition} from "@/lib/operations/object-conditions";
function fail(e:unknown){return NextResponse.json({error:e instanceof z.ZodError?e.issues[0]?.message:e instanceof AccessDeniedError?"Недостаточно прав":e instanceof Error?e.message:"Не удалось сохранить условия"},{status:e instanceof AccessDeniedError?403:409})}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({rows:await listObjectConditions(actor,z.string().uuid().parse((await params).id))})}catch(e){return fail(e)}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json(await saveObjectCondition(actor,z.string().uuid().parse((await params).id),conditionSchema.parse(await request.json())),{status:201})}catch(e){return fail(e)}}
