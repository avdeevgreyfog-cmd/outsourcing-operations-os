import { normalizeRecruitingStage, recruitingStages, recruitingStageLabels } from './model';
import type { RecruitingApplicationRow } from './service';
// Fictional fixture dates are fixed: changing the report window never moves events.
export function demoApplicationDetails(row: {id:string;stage?:string;reachedStage?:string;rejectionReason?:string;rejectionReasonCode?:string}, index:number): Partial<RecruitingApplicationRow> {
  const stage=index===18?'reserve':normalizeRecruitingStage(row.stage);
  const rank=Math.max(0,recruitingStages.indexOf(normalizeRecruitingStage(row.reachedStage??row.stage) as typeof recruitingStages[number]));
  const base=Date.parse('2026-09-19T06:00:00Z')-(rank*24+index%4*8)*3600000;
  const stageEvents: NonNullable<RecruitingApplicationRow['stageEvents']> = recruitingStages.slice(0,rank+1).map((toStage,i)=>({toStage,fromStage:i?recruitingStages[i-1]:null,createdAt:new Date(base+i*24*3600000).toISOString()}));
  if(stage==='reserve') stageEvents.push({toStage:'reserve',fromStage:recruitingStages[rank],createdAt:'2026-09-19T07:00:00Z',reason:'Сможет приступить после завершения текущей работы'});
  if(index===7){const contact=stageEvents.findIndex(x=>x.toStage==='contact');if(contact>=0)stageEvents.splice(contact,1);stageEvents[stageEvents.length-1].reason='Приглашён сразу на интервью по рекомендации';}
  if(stage==='rejected'||stage==='no_show') stageEvents.push({toStage:stage,fromStage:recruitingStages[rank],createdAt:new Date(base+(rank*24+1)*3600000).toISOString(),reason:row.rejectionReason,reasonCode:row.rejectionReasonCode});
  const planned=stage==='ready'?`2026-09-${20+index%3}`:stage==='started'||stage==='no_show'?stageEvents.at(-1)!.createdAt.slice(0,10):null;
  const next=stage==='reserve'?'2026-09-23T09:00:00Z':['started','rejected','no_show'].includes(stage)?null:new Date(Date.parse('2026-09-19T08:00:00Z')+(index%7-2)*3600000).toISOString();
  return {stage,stageLabel:recruitingStageLabels[stage],createdAt:new Date(base).toISOString(),updatedAt:stageEvents.at(-1)!.createdAt,stageEnteredAt:stageEvents.at(-1)!.createdAt,stageEvents,
    city:['Москва','Тула','Рязань','Калуга'][index%4],sourceChannel:null,sourceCampaign:`Тестовый набор · ${index%2?'Калуга':'Москва'}`,
    plannedStartDate:planned,actualStartAt:stage==='started'?stageEvents.at(-1)!.createdAt:null,nextActionAt:next,nextAction:next,
    workflow:{...(stage==='reserve'?{reserveReason:'Кандидат готов позже'}:{}),nextActionText:stage==='new'?'Позвонить по отклику':stage==='ready'?'Подтвердить прибытие':'Уточнить результат и следующий шаг',lastContact:stage==='new'?'':index%2?'Условия обсуждены, ожидает обратного звонка':'Документы запрошены; подтвердил интерес',plannedShift:planned?'Дневная · 08:00–20:00':'',confirmed:stage==='ready'||stage==='started',readiness:stage==='ready'||stage==='started',reviewRecipient:rank>=3?'Менеджер объекта':'',...(rank>=3?{reviewDueAt:'2026-09-19T12:00:00Z'}:{})}};
}
