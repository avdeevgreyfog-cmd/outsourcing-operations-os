import * as base from "@/lib/demo/data";
import type { CalculatorModelRule, CommercialApprovalRow, CommercialCalculationRow, CommercialCommentRow, CommercialHistoryRow, CommercialProposalRow, CommercialRateRow, CommercialRequestRow, CommercialRuleRow, ProvisionRow } from "@/lib/commercial/types";

const ORG="00000000-0000-4000-8000-000000000001";
const MOW="30000000-0000-4000-8000-000000000001";
const KLG="30000000-0000-4000-8000-000000000002";
const SALES="20000000-0000-4000-8000-000000000001";
const sales="10000000-0000-4000-8000-000000000002";
const economist="10000000-0000-4000-8000-000000000006";

export const requests: CommercialRequestRow[] = [
  {
    id:base.requests[0].id,organizationId:ORG,number:"З-2026-000101",title:base.requests[0].title,stage:"accepted",legacyStatus:base.requests[0].status,businessResult:"won",archived:false,
    clientId:base.clients[0].id,client:"NordLog",companyInn:"7700000101",contactName:"Андрей Петров",contactPosition:"Руководитель логистики",phone:"+7 495 000-10-10",email:"a.petrov@example.test",source:"Повторное обращение",
    siteName:"РЦ Север",location:base.requests[0].location,address:"Москва, Дмитровское шоссе",city:"Москва",regionId:MOW,region:"Москва и МО",transportAccess:"Корпоративный транспорт от метро",nearestTransport:"м. Физтех",logisticsComment:"Ночная разгрузка через отдельный КПП",
    ownerUserId:sales,owner:"Илья Морозов",createdByUserId:sales,teamId:SALES,createdAt:"26.08.2026 10:12",updatedAt:"31.08.2026 16:40",start:base.requests[0].start,duration:"12 месяцев",schedule:base.requests[0].schedule,
    roles:[{id:"rr-demo-1",name:"Комплектовщик",count:24,salaryTarget:390,scheduleType:"6/1",presenceHours:12,paidHours:11,lunchMinutes:60,lunchPaid:false,requirements:{citizenship:"РФ/ЕАЭС"}},{id:"rr-demo-2",name:"Грузчик",count:8,salaryTarget:420,scheduleType:"6/1",presenceHours:12,paidHours:11,lunchMinutes:60,lunchPaid:false}],totalHeadcount:32,housing:"Мы",vat:"С НДС",
    desiredClientRate:700,maxClientRate:720,clientRateVatMode:"with_vat",proposedWorkerPay:390,monthlyLimit:5100000,selectedScenarioId:base.calculations[0].id,agreedClientRate:713.25,acceptedProposalId:"7a000000-0000-4000-8000-000000000011",
    lastAction:"Клиент принял вторую версию КП",lastActionAt:"31.08.2026 16:40",nextAction:"Создать объект и передать запуск в операционный контур",nextActionAt:"01.09.2026 10:00",
  },
  {
    id:base.requests[1].id,organizationId:ORG,number:"З-2026-000102",title:base.requests[1].title,stage:"negotiation",legacyStatus:base.requests[1].status,businessResult:"open",archived:false,
    clientId:base.clients[1].id,client:"FormaBath",companyInn:"4000000202",contactName:"Марина Орлова",contactPosition:"HR BP",phone:"+7 4842 000-202",email:"m.orlova@example.test",source:"Входящий запрос",
    siteName:"Склад Калуга",location:"Калуга",address:"Калуга, промзона Северная",city:"Калуга",regionId:KLG,region:"Калужская область",transportAccess:"Общественный транспорт",nearestTransport:"ост. Промзона",logisticsComment:"Для вахты нужен трансфер от общежития",
    ownerUserId:sales,owner:"Илья Морозов",createdByUserId:sales,teamId:SALES,createdAt:"28.08.2026 09:30",updatedAt:"31.08.2026 14:15",start:base.requests[1].start,duration:"Бессрочно",schedule:base.requests[1].schedule,
    roles:[{id:"rr-demo-3",name:"Сборщик мебели",count:12,qualification:"Опыт сборки приветствуется",salaryTarget:410,scheduleType:"6/1",presenceHours:12,paidHours:11,lunchMinutes:60,lunchPaid:false}],totalHeadcount:12,housing:"Мы",vat:"С НДС",
    desiredClientRate:680,maxClientRate:700,clientRateVatMode:"with_vat",proposedWorkerPay:410,monthlyLimit:2200000,selectedScenarioId:base.calculations[2].id,
    lastAction:"Клиент попросил пересчитать цену с другим вариантом проживания",lastActionAt:"31.08.2026 14:15",nextAction:"Подготовить новый сценарий и повторно отправить на согласование",nextActionAt:"01.09.2026 12:00",
  },
  {
    id:"73000000-0000-4000-8000-000000000003",organizationId:ORG,number:"З-2026-000103",title:"Новая площадка — упаковка подарков",stage:"clarification",businessResult:"open",archived:false,
    client:null as never,client:"Не указана",contactName:"Анастасия",phone:"+7 977 000-00-31",source:"Публичная форма",siteName:"Площадка Мосрентген",location:"Москва, Мосрентген",city:"Москва",regionId:MOW,region:"Москва и МО",transportAccess:"Требует уточнения",
    ownerUserId:sales,owner:"Илья Морозов",createdByUserId:sales,teamId:SALES,createdAt:"31.08.2026 11:20",updatedAt:"31.08.2026 11:45",start:"01.09.2026",duration:"До 31.12.2026",schedule:"6/1 · 12 часов",
    roles:[{id:"rr-demo-4",name:"Комплектовщик",count:13,scheduleType:"6/1",presenceHours:12,paidHours:12},{id:"rr-demo-5",name:"Грузчик",count:5,scheduleType:"6/1",presenceHours:12,paidHours:12},{id:"rr-demo-6",name:"Уборщик",count:2,scheduleType:"6/1",presenceHours:12,paidHours:12}],totalHeadcount:20,vat:"Не указано",
    lastAction:"Анкета получена из публичной формы",lastActionAt:"31.08.2026 11:45",nextAction:"Уточнить компанию, НДС и зарплатные ориентиры",nextActionAt:"31.08.2026 17:00",
  },
  {
    id:"73000000-0000-4000-8000-000000000004",organizationId:ORG,number:"З-2026-000087",title:"Резервный проект — временная линия",stage:"proposal_sent",businessResult:"lost",archived:true,archivedAt:"25.08.2026 18:10",closeReason:"competitor",closeComment:"Клиент выбрал поставщика с более низкой ценой",closedAt:"25.08.2026 17:55",
    clientId:base.clients[2].id,client:"CityPack",contactName:"Олег Миронов",phone:"+7 495 000-87-00",source:"Исходящий контакт",siteName:"Склад Юг",location:"Москва",city:"Москва",regionId:MOW,region:"Москва и МО",
    ownerUserId:sales,owner:"Илья Морозов",createdByUserId:sales,teamId:SALES,createdAt:"12.08.2026 13:00",updatedAt:"25.08.2026 18:10",duration:"3 месяца",roles:[{id:"rr-demo-7",name:"Грузчик",count:10}],totalHeadcount:10,
    lastAction:"Заявка закрыта и перенесена в архив",lastActionAt:"25.08.2026 18:10",
  },
];

export const calculations: CommercialCalculationRow[] = [
  ...base.calculations.map((row,index)=>({
    ...row,calculationId:`78000000-0000-4000-8000-00000000000${index+1}`,requestId:row.requestId,sourceKind:"request" as const,calculationTitle:`Экономика · ${row.request}`,scenarioNumber:1,modelType:index===2?"gph":"employment",ruleVersionId:`rule-demo-${index+1}`,approvalStatus:row.status==="accepted"?"approved":"rework",createdAt:index===2?"31.08.2026 13:50":"28.08.2026 15:30",clientRateWithVat:Number(row.clientRate)*1.2,monthlyRevenue:Number(row.clientRate)*242*(index===0?24:index===1?8:12),
  })),
  {id:"79000000-0000-4000-8000-000000000010",organizationId:ORG,calculationId:"78000000-0000-4000-8000-000000000010",requestId:requests[1].id,request:requests[1].title,sourceKind:"request",calculationTitle:"Пересчёт после переговоров",role:"Сборщик мебели",name:"Вахта · другое проживание",scenarioNumber:2,model:"Трудовой договор",modelType:"employment",ruleVersionId:"rule-demo-employment",status:"draft",approvalStatus:null,workerNet:410,totalCost:552,clientRate:675,clientRateWithVat:810,marginPct:18.2,monthlyRevenue:1960200,monthlyContribution:357192,ownerUserId:economist,createdByUserId:economist,teamId:SALES,regionId:KLG,createdAt:"31.08.2026 15:05"},
  {id:"79000000-0000-4000-8000-000000000020",organizationId:ORG,calculationId:"78000000-0000-4000-8000-000000000020",request:null as never,requestId:null,request:"Самостоятельный расчёт",sourceKind:"standalone",calculationTitle:"Электромонтажники · Артём",role:"Электромонтажник",name:"Черновой ориентир без заявки",scenarioNumber:1,model:"Трудовой договор",modelType:"employment",ruleVersionId:"rule-demo-employment",status:"draft",workerNet:520,totalCost:684,clientRate:820,clientRateWithVat:984,marginPct:16.6,monthlyRevenue:1984400,monthlyContribution:329120,ownerUserId:economist,createdByUserId:economist,regionId:null,createdAt:"31.08.2026 17:10"},
];

export const proposals: CommercialProposalRow[] = [
  {id:"7a000000-0000-4000-8000-000000000010",organizationId:ORG,requestId:requests[0].id,request:requests[0].title,client:"NordLog",clientId:base.clients[0].id,version:1,status:"sent",scenarioCount:2,totalValue:4873632,validUntil:"05.09.2026",sentAt:"29.08.2026 12:10",createdAt:"28.08.2026",createdBy:"Илья Морозов",regionId:MOW,ownerUserId:sales,createdByUserId:sales,teamId:SALES,clientPayload:{positions:["Комплектовщик","Грузчик"],vat:"С НДС",terms:"Проживание и развозка включены"}},
  {id:"7a000000-0000-4000-8000-000000000011",organizationId:ORG,requestId:requests[0].id,request:requests[0].title,client:"NordLog",clientId:base.clients[0].id,version:2,status:"accepted",scenarioCount:2,totalValue:4752000,validUntil:"07.09.2026",sentAt:"31.08.2026 12:00",acceptedAt:"31.08.2026 16:40",supersedesProposalId:"7a000000-0000-4000-8000-000000000010",createdAt:"31.08.2026",createdBy:"Илья Морозов",regionId:MOW,ownerUserId:sales,createdByUserId:sales,teamId:SALES,clientPayload:{positions:["Комплектовщик","Грузчик"],vat:"С НДС",terms:"Скорректированная ставка после переговоров"}},
  {id:"7a000000-0000-4000-8000-000000000020",organizationId:ORG,requestId:requests[1].id,request:requests[1].title,client:"FormaBath",clientId:base.clients[1].id,version:1,status:"sent",scenarioCount:1,totalValue:0,validUntil:"06.09.2026",sentAt:"30.08.2026 17:20",createdAt:"30.08.2026",createdBy:"Илья Морозов",regionId:KLG,ownerUserId:sales,createdByUserId:sales,teamId:SALES,clientPayload:{positions:["Сборщик мебели"],vat:"С НДС"}},
];

export const approvals: CommercialApprovalRow[] = [
  {id:"appr-1",scenarioId:base.calculations[0].id,scenario:"Базовый трудовой договор",round:1,status:"approved",requestedAt:"28.08.2026 14:20",requestedBy:"Илья Морозов",assignedTo:"Елена Котова",decidedAt:"28.08.2026 15:30",decidedBy:"Елена Котова",comment:"Маржа и ключевые расходы приняты."},
  {id:"appr-2",scenarioId:base.calculations[2].id,scenario:"Сценарий ГПХ",round:1,status:"rework",requestedAt:"30.08.2026 12:10",requestedBy:"Илья Морозов",assignedTo:"Елена Котова",decidedAt:"30.08.2026 15:00",decidedBy:"Елена Котова",comment:"Пересчитать проживание и проверить лимит клиента."},
];

export const comments: CommercialCommentRow[] = [
  {id:"comment-1",entityType:"request",entityId:requests[0].id,type:"call",body:"Клиент подтвердил, что готов принять скорректированную ставку при фиксации условий на первый месяц.",author:"Илья Морозов",createdAt:"31.08.2026 16:25",visibility:"internal"},
  {id:"comment-2",entityType:"request",entityId:requests[1].id,type:"client_clarification",body:"Нужно сравнить проживание в Калуге и Воротынске; верхний предел клиента — 700 ₽/ч с НДС.",author:"Илья Морозов",createdAt:"31.08.2026 14:15",visibility:"internal"},
  {id:"comment-3",entityType:"calculation",entityId:base.calculations[2].id,type:"decision",body:"Вернуть сценарий на доработку из-за стоимости проживания.",author:"Елена Котова",createdAt:"30.08.2026 15:00",visibility:"internal"},
];

export const history: CommercialHistoryRow[] = [
  {id:"hist-1",verb:"proposal.accepted",summary:"Клиент принял КП v2",actor:"Илья Морозов",createdAt:"31.08.2026 16:40",entityType:"request",entityId:requests[0].id,metadata:{proposalVersion:2}},
  {id:"hist-2",verb:"proposal.sent",summary:"Клиенту отправлено КП v2",actor:"Илья Морозов",createdAt:"31.08.2026 12:00",entityType:"request",entityId:requests[0].id,metadata:{proposalVersion:2}},
  {id:"hist-3",verb:"calculation.created",summary:"Создан новый сценарий после переговоров",actor:"Елена Котова",createdAt:"31.08.2026 15:05",entityType:"request",entityId:requests[1].id,metadata:{scenarioNumber:2}},
  {id:"hist-4",verb:"request.stage_changed",summary:"Этап изменён: КП отправлено → Переговоры",actor:"Илья Морозов",createdAt:"31.08.2026 14:15",entityType:"request",entityId:requests[1].id},
];

export const provisions: Record<string,ProvisionRow[]> = {
  [requests[0].id]:[
    {id:"pr-1",code:"workwear",provider:"ours",amount:2100,unit:"₽/чел.",comment:"Первичный комплект"},{id:"pr-2",code:"ppe",provider:"ours",amount:650,unit:"₽/чел."},{id:"pr-3",code:"food",provider:"not_required"},{id:"pr-4",code:"housing",provider:"ours",amount:400,unit:"₽/сутки"},{id:"pr-5",code:"shuttle",provider:"ours",amount:18,unit:"₽/ч"},{id:"pr-6",code:"medical",provider:"client"},{id:"pr-7",code:"tools",provider:"client"},
  ],
  [requests[1].id]:[
    {id:"pr-8",code:"workwear",provider:"ours",amount:2400,unit:"₽/чел."},{id:"pr-9",code:"housing",provider:"ours",amount:450,unit:"₽/сутки",comment:"На пересчёте"},{id:"pr-10",code:"shuttle",provider:"ours",amount:32000,unit:"₽/мес."},{id:"pr-11",code:"medical",provider:"client"},
  ],
};

export const rates: CommercialRateRow[] = (base.rateReferences as Array<Record<string,unknown>>).map((row,index)=>({
  id:String(row.id),organizationId:ORG,specialty:String(row.specialty),region:String(row.region),regionId:String(row.regionId),employmentModel:String(row.employmentModel),amountMin:Number(row.amountMin),amountMax:Number(row.amountMax),unit:String(row.unit),grossNet:String(row.grossNet),source:String(row.source),sourceDate:String(row.sourceDate),confidence:String(row.confidence),comment:row.comment?String(row.comment):null,sourceKind:"market",createdByUserId:economist,
})).concat([
  {id:"rate-calc-1",organizationId:ORG,specialty:"Комплектовщик",region:"Москва и МО",regionId:MOW,employmentModel:"Трудовой договор",amountMin:670,amountMax:713,unit:"ч",grossNet:"Клиентская ставка",source:"Наши расчёты",sourceDate:"31.08.2026",confidence:"verified",sourceKind:"calculation",workerPay:390,clientOfferRate:713,workforceMode:"local",housingIncluded:true,createdByUserId:economist},
  {id:"rate-fact-1",organizationId:ORG,specialty:"Сборщик мебели",region:"Калужская область",regionId:KLG,employmentModel:"Трудовой договор",amountMin:690,amountMax:690,unit:"ч",grossNet:"Факт объекта",source:"Завод Воротынск",sourceDate:"31.08.2026",confidence:"verified",sourceKind:"object_fact",workerPay:410,actualObjectRate:690,actualMarginPct:16.2,workforceMode:"rotation",housingIncluded:true,createdByUserId:economist},
]);

export const rules: CommercialRuleRow[] = [
  {id:"cr-1",category:"commercial_defaults",version:1,effectiveFrom:"01.08.2026",verified:false,source:"Демонстрационная конфигурация — требует проверки",rules:{minimumMarginPct:12,recommendedMarginPct:18,roundingStep:1},createdAt:"01.08.2026"},
  {id:"cr-2",category:"housing",version:1,effectiveFrom:"01.08.2026",verified:false,source:"Демонстрационная конфигурация — требует проверки",rules:{defaultPerDay:400,unit:"RUB/day"},createdAt:"01.08.2026"},
];

// These values are intentionally synthetic demo rules, not current tax/legal advice.
export const calculatorModelRules: CalculatorModelRule[] = [
  {code:"employment",label:"Трудовой договор",ruleVersionId:"demo-employment-v1",verified:false,mandatoryChargePct:30,vatRatePct:20,minimumMarginPct:12,recommendedMarginPct:18,defaults:{housingPerShift:400,transportPerHour:18,workwearPerWorkerMonth:2100,ppePerWorkerMonth:650,medicalPerWorkerMonth:0,recruitmentProjectMonth:35000,managementProjectMonth:65000}},
  {code:"gph",label:"ГПХ",ruleVersionId:"demo-gph-v1",verified:false,mandatoryChargePct:13,vatRatePct:20,minimumMarginPct:12,recommendedMarginPct:18,defaults:{housingPerShift:400,transportPerHour:18,workwearPerWorkerMonth:2100,ppePerWorkerMonth:650,medicalPerWorkerMonth:0,recruitmentProjectMonth:35000,managementProjectMonth:65000}},
  {code:"npd",label:"НПД",ruleVersionId:"demo-npd-v1",verified:false,mandatoryChargePct:6,vatRatePct:20,minimumMarginPct:12,recommendedMarginPct:18,defaults:{housingPerShift:400,transportPerHour:18,workwearPerWorkerMonth:2100,ppePerWorkerMonth:650,medicalPerWorkerMonth:0,recruitmentProjectMonth:35000,managementProjectMonth:65000}},
  {code:"custom",label:"Модель компании",ruleVersionId:"demo-custom-v1",verified:false,mandatoryChargePct:18,vatRatePct:20,minimumMarginPct:12,recommendedMarginPct:18,defaults:{housingPerShift:400,transportPerHour:18,workwearPerWorkerMonth:2100,ppePerWorkerMonth:650,medicalPerWorkerMonth:0,recruitmentProjectMonth:35000,managementProjectMonth:65000}},
];
