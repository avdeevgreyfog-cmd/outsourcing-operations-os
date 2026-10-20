import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentActor } from '@/lib/auth/server';
import { AccessDeniedError } from '@/lib/access/server';
import { getWorkerEditorContext, saveWorkerChange, WorkerEditorError } from '@/lib/operations/worker-editor';

async function handle(request:Request,params:Promise<{id:string}>,write:boolean){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:'Необходимо войти в систему'},{status:401});
    const {id}=await params;
    if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'Некорректный сотрудник'},{status:400});
    return NextResponse.json(write?await saveWorkerChange(actor,id,await request.json()):await getWorkerEditorContext(actor,id));
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:'Недостаточно прав для этого сотрудника'},{status:403});
    if(error instanceof WorkerEditorError)return NextResponse.json({error:error.message},{status:error.status});
    if(error instanceof z.ZodError||error instanceof SyntaxError)return NextResponse.json({error:'Проверьте заполнение полей и даты периода'},{status:400});
    console.error('worker editor',error);return NextResponse.json({error:'Не удалось сохранить данные сотрудника. Введённые значения сохранены в форме.'},{status:500});
  }
}
export function GET(request:Request,{params}:{params:Promise<{id:string}>}){return handle(request,params,false);}
export function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){return handle(request,params,true);}
