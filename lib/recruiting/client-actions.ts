'use client';
import type { RecruitingApplicationRow } from './service';
import { recruitingStageLabels } from './model';
import { validateStageChange, type StageChange } from './workflow';
import { saveDemoApplication } from './demo-client';
export async function saveApplicationChange(row:RecruitingApplicationRow, change:StageChange, demo:boolean) {
  const error=validateStageChange(row,change);if(error)throw new Error(error);
  if(!demo){const response=await fetch(`/api/candidates/${row.candidateId}/stage`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...change,applicationId:row.applicationId,expectedStage:row.stage,expectedUpdatedAt:row.updatedAt})});const result=await response.json();if(!response.ok)throw new Error(result.error??'Не удалось сохранить изменения');return;}
  const now=new Date().toISOString();const changed=row.stage!==change.stage;
  const demoOwnerNames:Record<string,string>={"10000000-0000-4000-8000-000000000003":"Дмитрий Орлов","10000000-0000-4000-8000-000000000004":"Алексей Волков","10000000-0000-4000-8000-000000000005":"Ольга Новикова"};
  const updated:RecruitingApplicationRow={...row,stage:change.stage,stageLabel:recruitingStageLabels[change.stage],updatedAt:now,stageEnteredAt:changed?now:row.stageEnteredAt,ownerUserId:change.ownerUserId===undefined?row.ownerUserId:change.ownerUserId,owner:change.ownerUserId===undefined?row.owner:(change.ownerUserId?demoOwnerNames[change.ownerUserId]??"Сотрудник":null),
    workflow:{...row.workflow,...change.workflow},nextActionAt:change.nextActionAt===undefined?row.nextActionAt:change.nextActionAt,nextAction:change.nextActionAt===undefined?row.nextAction:change.nextActionAt,
    plannedStartDate:change.plannedStartDate===undefined?row.plannedStartDate:change.plannedStartDate,
    plannedArrivalAt:change.plannedArrivalAt===undefined?row.plannedArrivalAt:change.plannedArrivalAt,
    actualStartAt:change.actualStartAt===undefined?row.actualStartAt:change.actualStartAt,
    rejectionReason:change.reason??null,rejectionReasonCode:change.reasonCode??null,
    stageEvents:changed?[...(row.stageEvents??[]),{fromStage:row.stage,toStage:change.stage,createdAt:now,reason:change.reason,reasonCode:change.reasonCode}]:row.stageEvents};
  const comment=change.workflow?.additionalComment?.trim()||change.workflow?.lastContact?.trim();
  if(comment && comment!==(row.workflow?.additionalComment??row.workflow?.lastContact)){
    const key='operis.recruiting.communications.v1';
    const history=JSON.parse(localStorage.getItem(key)??'[]');
    history.unshift({id:crypto.randomUUID(),candidateId:row.candidateId,applicationId:row.applicationId,channel:'note',direction:'internal',summary:comment,happenedAt:new Date().toLocaleString('ru-RU'),author:'Текущий пользователь'});
    localStorage.setItem(key,JSON.stringify(history));
  }
  saveDemoApplication(updated);
}
