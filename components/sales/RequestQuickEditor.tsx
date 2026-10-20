"use client";
import {useEffect,useState,type ComponentProps} from "react";
import Link from "next/link";
import {getDemoRequest} from "@/lib/commercial/demo-workspace-client";
import {normalizeRequestIntake} from "@/lib/commercial/request-intake";
import {RequestIntakeWorkspacePolished} from "@/components/RequestIntakeWorkspacePolished";
import {SalesDrawer} from "@/components/sales/SalesUI";
type Data=Pick<ComponentProps<typeof RequestIntakeWorkspacePolished>,"request"|"intake"|"workflowMeta">;
export function RequestQuickEditor({id,options,demo,base,onClose}:{id:string;options:ComponentProps<typeof RequestIntakeWorkspacePolished>["options"];demo:boolean;base:ComponentProps<typeof RequestIntakeWorkspacePolished>["demoRequestBase"];onClose:()=>void}){
  const [data,setData]=useState<Data|null>(null);const [error,setError]=useState("");
  useEffect(()=>{const local=demo?getDemoRequest(id):null;if(local){const payload=local.payload;const timer=setTimeout(()=>setData({request:{...payload,id,roles:payload.roles.map((x,index)=>({id:x.id??`${id}:role:${index}`,specialtyId:x.specialtyId??"",specialty:x.specialtyName,count:x.count,schedule:x.schedule,requirements:x.requirements,targetClientRate:x.targetClientRate}))},intake:normalizeRequestIntake(payload.intake),workflowMeta:{owner:local.board.owner,observers:options.members.filter(x=>payload.observerUserIds.includes(x.id)),timeline:[]}}),0);return()=>clearTimeout(timer);}const controller=new AbortController();fetch(`/api/requests/${id}/v2`,{signal:controller.signal}).then(async response=>{const json=await response.json();if(!response.ok)throw new Error(json.error);setData(json);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Не удалось загрузить заявку");});return()=>controller.abort();},[id,demo,options.members]);
  return <SalesDrawer overline="Редактирование" title="Быстрое редактирование заявки" subtitle={base?.title} onClose={onClose} footer={<Link className="button" href={`/requests/${id}`}>Открыть карточку</Link>}>
    {error?<p className="form-error" role="alert">{error}</p>:data?<RequestIntakeWorkspacePolished {...data} options={options} section="quick" demo={demo} demoRequestId={demo?id:undefined} demoRequestBase={base} onSaved={onClose} onCancel={onClose}/>:<p role="status">Загружаю сохранённые данные…</p>}
  </SalesDrawer>;
}
