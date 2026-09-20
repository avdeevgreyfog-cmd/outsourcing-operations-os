import { normalizeRecruitingStage, recruitingStages, recruitingStageLabels, type RecruitingStage } from './model';
import type { RecruitingApplicationRow } from './service';
import type { WorkflowDetails } from './workflow';

type DemoCandidateSeed = {
  id:string;
  stage?:string;
  reachedStage?:string;
  rejectionReason?:string;
  rejectionReasonCode?:string;
  ownerUserId?:string|null;
};

const employmentDocuments=["Паспорт","СНИЛС","ИНН","Банковские реквизиты","Трудовая книжка / СТД","Военный билет / документ воинского учёта"];
const clearanceDocuments=["Медицинская комиссия","Удостоверение / допуск"];
const objectManager="10000000-0000-4000-8000-000000000004";
const regionalManager="10000000-0000-4000-8000-000000000003";

function ownerName(row:DemoCandidateSeed){
  return row.ownerUserId===objectManager?"Алексей Волков":row.ownerUserId===regionalManager?"Дмитрий Орлов":"Ольга Новикова";
}

function stageDate(stage:RecruitingStage,index:number){
  const baseDay=2+(index%12);
  const hour=8+(index%8);
  const day=(value:number)=>String(value).padStart(2,"0");
  if(stage==="first_shift") return `2026-09-${day(Math.min(18,baseDay+4))}T${day(hour)}:00:00+03:00`;
  if(stage==="retention_7") return `2026-09-${day(Math.min(12,baseDay))}T${day(hour)}:00:00+03:00`;
  if(stage==="retention_30") return `2026-08-${day(8+(index%6))}T${day(hour)}:00:00+03:00`;
  return `2026-09-${day(baseDay)}T${day(hour)}:00:00+03:00`;
}

function reachedActiveStage(row:DemoCandidateSeed): RecruitingStage {
  const current=normalizeRecruitingStage(row.stage);
  if(["rejected","no_show","reserve"].includes(current)){
    const reached=normalizeRecruitingStage(row.reachedStage);
    return recruitingStages.includes(reached as typeof recruitingStages[number])?reached:"interview";
  }
  return current;
}

function communicationSummaries(stage:RecruitingStage,index:number){
  if(stage==="new") return ["Контакт получен, первичный звонок ещё не выполнен."];
  if(stage==="interview") return index%3===0
    ? ["Первый звонок без ответа. Назначена повторная попытка.","Дозвонились: условия вакансии проговорили, кандидат задаёт вопросы по проживанию."]
    : ["Созвонились: вакансия интересна, уточнили опыт и готовность к графику.","Кандидат подтвердил, что готов продолжить оформление."];
  if(stage==="documents") return ["После интервью кандидат подтвердил интерес.","Запросили паспорт, СНИЛС, ИНН и реквизиты.","Часть документов получена, ожидаем оставшиеся."];
  if(stage==="clearance") return ["Документы для оформления собраны.","Запущены медкомиссия и необходимые допуски.","Часть процедур ещё в работе."];
  if(stage==="preparation") return ["Документы собраны и проверены.","Согласована ориентировочная дата выхода.","Уточнили проезд и подтверждение прибытия."];
  if(stage==="first_shift") return ["Кандидат подтвердил приезд.","Мастер подтвердил первый выход на смену."];
  if(stage==="retention_7") return ["Первый выход подтверждён.","Контроль после недели: сотрудник продолжает работать, критичных замечаний нет."];
  if(stage==="retention_30") return ["Первый выход подтверждён.","Контроль 7 дней пройден.","Контроль 30 дней: сотрудник остаётся на объекте."];
  if(stage==="reserve") return ["Условия подходят, но сейчас кандидат не может приступить.","Перенесён в резерв с датой повторного контакта."];
  if(stage==="rejected") return ["Условия вакансии проговорили.", "Заявка завершена: "+(index%2?"кандидат отказался.":"зафиксирована причина отказа.")];
  if(stage==="no_show") return ["Дата выхода и логистика были согласованы.","Кандидат не прибыл / не вышел в согласованную смену."];
  return [];
}

// Deterministic recruiting history for the demo workspace.
// Dates are intentionally fixed so analytics and screenshots do not move between renders.
export function demoApplicationDetails(row: DemoCandidateSeed, index:number): Partial<RecruitingApplicationRow> {
  const stage=normalizeRecruitingStage(row.stage);
  const reached=reachedActiveStage(row);
  const rank=Math.max(0,recruitingStages.indexOf(reached as typeof recruitingStages[number]));
  const actualStartAt=stage==="retention_30"
    ? `2026-08-${String(8+(index%6)).padStart(2,"0")}T08:00:00+03:00`
    : stage==="retention_7"
      ? `2026-09-${String(8+(index%5)).padStart(2,"0")}T08:00:00+03:00`
      : ["first_shift"].includes(stage)
        ? `2026-09-${String(16+(index%3)).padStart(2,"0")}T08:00:00+03:00`
        : null;

  const timelineStages=recruitingStages.slice(0,rank+1);
  const stageEvents:NonNullable<RecruitingApplicationRow["stageEvents"]>=timelineStages.map((toStage,i)=>{
    const eventDate=toStage==="first_shift"&&actualStartAt
      ? actualStartAt
      : new Date(Date.parse(stageDate(reached,index))-(rank-i)*24*60*60*1000).toISOString();
    return {toStage,fromStage:i?timelineStages[i-1]:null,createdAt:eventDate};
  });

  if(["rejected","no_show","reserve"].includes(stage)){
    stageEvents.push({
      toStage:stage,
      fromStage:reached,
      createdAt:new Date(Date.parse(stageEvents.at(-1)?.createdAt??stageDate(reached,index))+3*60*60*1000).toISOString(),
      reason:stage==="reserve"?"Готов вернуться к вакансии позже":row.rejectionReason??null,
      reasonCode:row.rejectionReasonCode??null,
    });
  }

  const employmentReady=stage==="documents"?3+(index%3):rank>=recruitingStages.indexOf("clearance")||["preparation","first_shift","retention_7","retention_30","no_show"].includes(stage)?6:0;
  const clearanceReady=stage==="clearance"?index%2:rank>=recruitingStages.indexOf("preparation")||["preparation","first_shift","retention_7","retention_30","no_show"].includes(stage)?2:0;
  const employmentMissing=employmentDocuments.slice(Math.min(employmentReady,employmentDocuments.length));
  const clearancePending=clearanceDocuments.slice(Math.min(clearanceReady,clearanceDocuments.length));
  const received=employmentReady+clearanceReady;
  const missing=[...employmentMissing,...clearancePending];
  const plannedStartDate=["preparation","first_shift","retention_7","retention_30","no_show"].includes(stage)
    ? (actualStartAt?.slice(0,10)??`2026-09-${String(21+(index%5)).padStart(2,"0")}`)
    : null;
  const plannedArrivalAt=["preparation","first_shift","retention_7","retention_30","no_show"].includes(stage)
    ? (actualStartAt??`2026-09-${String(20+(index%5)).padStart(2,"0")}T18:00:00+03:00`)
    : null;

  const travelState=stage==="preparation"
    ? (["ticket_required","ticket_bought","company","self"] as const)[index%4]
    : ["first_shift","retention_7","retention_30"].includes(stage)
      ? "ticket_bought" as const
      : stage==="no_show"
        ? "company" as const
        : "not_required" as const;

  const nextActionAt=["rejected","no_show","retention_30"].includes(stage)
    ? null
    : stage==="reserve"
      ? "2026-09-27T10:00:00+03:00"
      : stage==="new"
        ? null
        : stage==="interview"
          ? `2026-09-21T${String(9+(index%8)).padStart(2,"0")}:30:00+03:00`
          : stage==="documents"
            ? "2026-09-21T12:00:00+03:00"
            : stage==="clearance"
              ? "2026-09-21T15:00:00+03:00"
            : stage==="preparation"
              ? "2026-09-21T17:00:00+03:00"
              : "2026-09-22T10:00:00+03:00";

  const summaries=communicationSummaries(stage,index);
  const author=ownerName(row);
  const recentCommunications=summaries.map((summary,communicationIndex)=>({
    id:`demo-communication-${row.id}-${communicationIndex+1}`,
    channel:communicationIndex===0&&stage==="new"?"system":index%3===0?"phone":index%3===1?"whatsapp":"telegram",
    summary,
    happenedAt:new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Moscow"}).format(new Date(Date.parse(stageEvents.at(-1)?.createdAt??stageDate(reached,index))-communicationIndex*3*60*60*1000)),
    author:communicationIndex===0&&stage==="new"?"Система":author,
  }));

  const workflow:WorkflowDetails={
    nextActionText:
      stage==="new"?"Позвонить по новому контакту":
      stage==="interview"?(index%3===0?"Повторить звонок и получить решение":"Уточнить решение по вакансии"):
      stage==="documents"?"Получить недостающие документы":
      stage==="clearance"?"Проверить готовность допусков":
      stage==="preparation"?(travelState==="ticket_required"?"Купить билет и подтвердить выезд":"Подтвердить дату прибытия"):
      stage==="first_shift"?"Получить подтверждение мастера по первой смене":
      stage==="retention_7"?"Контроль удержания после первой недели":
      stage==="retention_30"?"Контроль 30 дней пройден":
      stage==="reserve"?"Вернуться к кандидату в согласованную дату":"Заявка завершена",
    lastContact:summaries.at(-1)??"",
    contactAttempts:stage==="new"?0:stage==="interview"?1+(index%3):2,
    plannedShift:["preparation","first_shift","retention_7","retention_30","no_show"].includes(stage)?"Дневная · 08:00–20:00":"",
    actionCode:stage==="new"?"inbound_contact":stage==="interview"?"interview":stage==="documents"?"documents_wait":stage==="clearance"?"clearance_progress":stage==="preparation"?"preparation_save":stage==="first_shift"?"shift_worked":"retention_check",
    outcomeCode:stage==="new"?"unprocessed":stage==="interview"?"in_progress":stage==="documents"?"waiting":stage==="clearance"?"in_progress":stage==="preparation"?"planned":stage==="first_shift"?"worked":"active",
    confirmed:["preparation","first_shift","retention_7","retention_30"].includes(stage)&&stage!=="no_show",
    readiness:["preparation","first_shift","retention_7","retention_30"].includes(stage),
    reserveReason:stage==="reserve"?"Заканчивает текущую работу и сможет выйти позже":undefined,
    travelState,
    housingState:["preparation","first_shift","retention_7","retention_30"].includes(stage)?(index%3===0?"needs_booking":"booked"):"not_required",
    housingAssigneeUserId:["preparation","first_shift","retention_7","retention_30"].includes(stage)?objectManager:undefined,
    housingDueAt:["preparation","first_shift","retention_7","retention_30"].includes(stage)?"2026-09-20T12:00:00+03:00":undefined,
    ticketAssigneeUserId:travelState==="ticket_required"||travelState==="ticket_bought"?regionalManager:undefined,
    ticketDueAt:travelState==="ticket_required"||travelState==="ticket_bought"?"2026-09-20T10:00:00+03:00":undefined,
    firstShiftOutcome:["first_shift","retention_7","retention_30"].includes(stage)?"worked":undefined,
    travelNote:
      travelState==="ticket_required"?"Нужно купить билет до Москвы":
      travelState==="ticket_bought"?"Билет оформлен, данные отправлены кандидату":
      travelState==="company"?"Проезд организует компания":
      travelState==="self"?"Кандидат добирается самостоятельно":"",
    documentsRequired:5,
    documentsReceived:received,
    missingDocuments:missing,
  };

  return {
    stage,
    stageLabel:recruitingStageLabels[stage],
    createdAt:stageEvents[0]?.createdAt??stageDate(reached,index),
    updatedAt:stageEvents.at(-1)?.createdAt??stageDate(reached,index),
    stageEnteredAt:stageEvents.at(-1)?.createdAt??stageDate(reached,index),
    stageEvents,
    plannedStartDate,
    plannedArrivalAt,
    actualStartAt,
    nextActionAt,
    nextAction:nextActionAt,
    workflow,
    recentCommunications,
    documentSummary:{required:8,received,missing,employmentRequired:6,employmentReady,employmentMissing,clearanceRequired:2,clearanceReady,clearancePending},
  };
}
