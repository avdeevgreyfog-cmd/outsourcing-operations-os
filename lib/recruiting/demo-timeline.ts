import { normalizeRecruitingStage, recruitingStages, recruitingStageLabels } from './model';
import type { RecruitingApplicationRow } from './service';

// Fictional fixture dates are fixed: changing the report window never moves events.
export function demoApplicationDetails(row: {id:string;stage?:string;reachedStage?:string;rejectionReason?:string;rejectionReasonCode?:string}, index:number): Partial<RecruitingApplicationRow> {
  const stage=index===18?'reserve':normalizeRecruitingStage(row.stage);
  const rank=Math.max(0,recruitingStages.indexOf(normalizeRecruitingStage(row.reachedStage??row.stage) as typeof recruitingStages[number]));
  const base=Date.parse('2026-09-19T06:00:00Z')-(rank*24+index%4*8)*3600000;
  const stageEvents: NonNullable<RecruitingApplicationRow['stageEvents']> = recruitingStages.slice(0,rank+1).map((toStage,i)=>({
    toStage,
    fromStage:i?recruitingStages[i-1]:null,
    createdAt:new Date(base+i*24*3600000).toISOString(),
  }));
  if(stage==='reserve') stageEvents.push({toStage:'reserve',fromStage:recruitingStages[rank],createdAt:'2026-09-19T07:00:00Z',reason:'Сможет приступить после завершения текущей работы'});
  if(index===7){
    const interview=stageEvents.findIndex(x=>x.toStage==='interview');
    if(interview>=0)stageEvents.splice(interview,1);
    stageEvents[stageEvents.length-1].reason='Переведён дальше по рекомендации';
  }
  if(stage==='rejected'||stage==='no_show') stageEvents.push({toStage:stage,fromStage:recruitingStages[rank],createdAt:new Date(base+(rank*24+1)*3600000).toISOString(),reason:row.rejectionReason,reasonCode:row.rejectionReasonCode});
  const postStart=['first_shift','retention_7','retention_30'].includes(stage);
  const planned=stage==='preparation'?'2026-09-'+String(20+index%3).padStart(2,'0'):postStart||stage==='no_show'?stageEvents.at(-1)!.createdAt.slice(0,10):null;
  const next=stage==='reserve'?'2026-09-23T09:00:00Z':postStart||['rejected','no_show'].includes(stage)?null:new Date(Date.parse('2026-09-19T08:00:00Z')+(index%7-2)*3600000).toISOString();
  return {
    stage,
    stageLabel:recruitingStageLabels[stage],
    createdAt:new Date(base).toISOString(),
    updatedAt:stageEvents.at(-1)!.createdAt,
    stageEnteredAt:stageEvents.at(-1)!.createdAt,
    stageEvents,
    city:['Москва','Тула','Рязань','Калуга'][index%4],
    sourceChannel:null,
    sourceCampaign:'Тестовый набор · '+(index%2?'Калуга':'Москва'),
    plannedStartDate:planned,
    actualStartAt:postStart?(stageEvents.find(event=>event.toStage==='first_shift')?.createdAt??stageEvents.at(-1)!.createdAt):null,
    nextActionAt:next,
    nextAction:next,
    workflow:{
      ...(stage==='reserve'?{reserveReason:'Кандидат готов позже'}:{}),
      nextActionText:stage==='new'?'Позвонить по отклику':stage==='preparation'?'Подтвердить дату выхода':'Уточнить результат и следующий шаг',
      lastContact:stage==='new'?'':index%2?'Условия обсуждены, ожидает обратного звонка':'Документы запрошены; подтвердил интерес',
      plannedShift:planned?'Дневная · 08:00–20:00':'',
      confirmed:stage==='preparation'||postStart,
      readiness:stage==='preparation'||postStart,
      travelState:stage==='preparation'?'ticket_required':postStart?'ticket_bought':'not_required',
      documentsRequired:rank>=2?5:0,
      documentsReceived:rank>=3?5:rank===2?3:0,
      missingDocuments:rank===2?['СНИЛС','Реквизиты']:[],
    },
  };
}
