"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhoneCall, UserRound } from "lucide-react";
import { SalesDrawer } from "@/components/sales/SalesUI";
import type { RecruitingApplicationRow, RecruitingFunnelStageSetting, RecruitingNeedRow, RecruitingOptions } from "@/lib/recruiting/service";
import type { RecruitingStage } from "@/lib/recruiting/model";
import { recruitingStageLabels } from "@/lib/recruiting/model";
import { formatWorkDate, workRisks } from "@/lib/recruiting/workflow";
import { saveApplicationChange } from "@/lib/recruiting/client-actions";
import { saveDemoApplication } from "@/lib/recruiting/demo-client";

type DocumentRow={
  documentTypeId:string;
  name:string;
  groupType:"employment"|"clearance";
  provider:"candidate"|"company"|"client";
  status:string;
  note:string|null;
  requiredByStage?:"documents"|"preparation"|"first_shift"|"retention_7"|"retention_30"|"none";
  blocksProgress?:boolean;
  responsibleUserId?:string|null;
  responsible?:string|null;
  dueAt?:string|null;
};

type ActionOption={code:string;label:string;hint:string;tone?:"danger"|"neutral"};

const stageActions:Partial<Record<RecruitingStage,ActionOption[]>>={
  new:[
    {code:"take_in_work",label:"Взять в работу",hint:"Перевести контакт в интервью"},
    {code:"invalid_contact",label:"Некорректный контакт",hint:"Закрыть без интервью",tone:"danger"},
    {code:"duplicate",label:"Дубликат",hint:"Контакт уже есть в базе",tone:"danger"},
  ],
  interview:[
    {code:"interested",label:"Заинтересован",hint:"Перейти к документам"},
    {code:"callback",label:"Перезвонить",hint:"Кандидату нужно время"},
    {code:"no_answer",label:"Не дозвонился",hint:"Назначить повторный звонок"},
    {code:"manager_interview",label:"Передать мастеру",hint:"Дополнительное интервью"},
    {code:"alternative_need",label:"Другая вакансия",hint:"Предложить другую потребность"},
    {code:"declined",label:"Отказался",hint:"Закрыть по причине",tone:"danger"},
    {code:"not_suitable",label:"Не подходит",hint:"Зафиксировать причину",tone:"danger"},
  ],
  documents:[
    {code:"documents_wait",label:"Ожидаем документы",hint:"Назначить срок проверки"},
    {code:"documents_complete",label:"Документы собраны",hint:"Перейти к следующему активному этапу"},
    {code:"documents_stopped",label:"Оформление прекращено",hint:"Закрыть заявку",tone:"danger"},
  ],
  clearance:[
    {code:"clearance_progress",label:"Оформление в работе",hint:"Назначить контрольную дату"},
    {code:"clearance_complete",label:"Всё готово",hint:"Перейти к подготовке выхода"},
    {code:"clearance_failed",label:"Допуск не получен",hint:"Закрыть по причине",tone:"danger"},
  ],
  preparation:[
    {code:"preparation_save",label:"Сохранить подготовку",hint:"Зафиксировать прибытие, билет и жильё"},
    {code:"ready_for_start",label:"Готов к первому выходу",hint:"Перейти к контролю первой смены"},
    {code:"preparation_declined",label:"Отказался до выхода",hint:"Закрыть заявку",tone:"danger"},
  ],
  first_shift:[
    {code:"shift_worked",label:"Вышел на смену",hint:"Подтвердить фактический выход"},
    {code:"shift_no_show",label:"Не вышел",hint:"Зафиксировать причину",tone:"danger"},
    {code:"shift_not_admitted",label:"Не допущен",hint:"Зафиксировать причину недопуска",tone:"danger"},
  ],
};

const providerLabels={candidate:"Кандидат",company:"Компания",client:"Заказчик"} as const;
const statusLabels:Record<string,string>={
  missing:"Не получен",requested:"Запрошен",received:"Получен",verified:"Проверен",rejected:"Отклонён",not_required:"Не требуется",
  to_prepare:"Нужно оформить",in_progress:"В работе",ready:"Готов",
};

export function RecruitingActionDrawer({
  row,need=null,needs=[],stages,recruiters=[],initialStage,exitReasons,demo,canEdit,canConvert,onClose,onSaved,
}:{
  row:RecruitingApplicationRow;
  need?:RecruitingNeedRow|null;
  needs?:RecruitingNeedRow[];
  stages?:RecruitingFunnelStageSetting[];
  recruiters?:Array<{id:string;name:string}>;
  initialStage?:RecruitingStage;
  exitReasons:RecruitingOptions["exitReasons"];
  demo:boolean;
  canEdit:boolean;
  canConvert:boolean;
  onClose:()=>void;
  onSaved?:()=>void;
}){
  const router=useRouter();
  const impliedAction=initialStage===undefined?"":{
    "new:interview":"take_in_work",
    "interview:documents":"interested",
    "documents:clearance":"documents_complete",
    "documents:preparation":"documents_complete",
    "clearance:preparation":"clearance_complete",
    "preparation:first_shift":"ready_for_start",
  }[row.stage+":"+initialStage]??"";
  const [action,setAction]=useState(impliedAction);
  const [ownerUserId,setOwnerUserId]=useState(row.ownerUserId??"");
  const [comment,setComment]=useState("");
  const [nextAt,setNextAt]=useState(localDate(row.nextActionAt));
  const [reasonCode,setReasonCode]=useState(row.rejectionReasonCode??"");
  const [managerInterviewUserId,setManagerInterviewUserId]=useState(row.workflow?.managerInterviewUserId??"");
  const [alternativeNeedId,setAlternativeNeedId]=useState("");
  const [plannedArrival,setPlannedArrival]=useState(localDate(row.plannedArrivalAt));
  const [plannedStart,setPlannedStart]=useState(row.plannedStartDate??"");
  const [actualStart,setActualStart]=useState(localDate(row.actualStartAt));
  const [travelState,setTravelState]=useState(row.workflow?.travelState??"not_required");
  const [ticketAssignee,setTicketAssignee]=useState(row.workflow?.ticketAssigneeUserId??"");
  const [ticketDue,setTicketDue]=useState(localDate(row.workflow?.ticketDueAt));
  const housingProvided=need?.conditions?.housingProvided===true;
  const [housingState,setHousingState]=useState(row.workflow?.housingState??(housingProvided?"needs_booking":"not_required"));
  const [housingAssignee,setHousingAssignee]=useState(row.workflow?.housingAssigneeUserId??"");
  const [housingDue,setHousingDue]=useState(localDate(row.workflow?.housingDueAt));
  const [documents,setDocuments]=useState<DocumentRow[]|null>(()=>demo&&showDocumentsAtStage(row.stage)?buildDemoDocuments(row):null);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  const orderedStages=useMemo(()=>(stages?.length?stages:[
    {code:"new",label:"Новый контакт",sortOrder:10,active:true,systemType:"intake"},
    {code:"interview",label:"Интервью",sortOrder:20,active:true,systemType:"qualification"},
    {code:"documents",label:"Документы для оформления",sortOrder:30,active:true,systemType:"documents"},
    {code:"clearance",label:"Оформление и допуски",sortOrder:40,active:true,systemType:"clearance"},
    {code:"preparation",label:"Подготовка к выходу",sortOrder:50,active:true,systemType:"preparation"},
    {code:"first_shift",label:"Первый выход",sortOrder:60,active:true,systemType:"start"},
    {code:"retention_7",label:"7 дней",sortOrder:70,active:true,systemType:"retention"},
    {code:"retention_30",label:"30 дней",sortOrder:80,active:true,systemType:"retention_final"},
  ] as RecruitingFunnelStageSetting[]).filter(item=>item.active).sort((a,b)=>a.sortOrder-b.sortOrder),[stages]);
  const stageLabel=(value:RecruitingStage)=>orderedStages.find(item=>item.code===value)?.label??recruitingStageLabels[value];
  const nextActiveStage=(value:RecruitingStage)=>{
    const index=orderedStages.findIndex(item=>item.code===value);
    return (index>=0?orderedStages[index+1]?.code:null)??(value==="documents"?"preparation":value);
  };
  const risks=workRisks(row);
  const activeNeeds=needs.filter(item=>["open","in_progress"].includes(item.status)&&item.id!==row.needId);

  useEffect(()=>{
    if(demo||!showDocumentsAtStage(row.stage))return;
    let active=true;
    fetch("/api/candidates/"+row.candidateId+"/documents?applicationId="+row.applicationId)
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error);if(active)setDocuments(body.items);})
      .catch(()=>{if(active)setDocuments([]);});
    return()=>{active=false};
  },[demo,row.applicationId,row.candidateId,row.stage]);

  function requireNext(){
    if(!nextAt)throw new Error("Укажите дату и время следующего контакта.");
    return new Date(nextAt).toISOString();
  }

  async function performAction(){
    if(!action)throw new Error("Выберите результат текущего этапа.");
    if(!canEdit)throw new Error("Недостаточно прав для изменения кандидата.");
    if(action==="alternative_need"){await moveToAlternative();return;}

    let targetStage:RecruitingStage=row.stage;
    let nextAction:string|null=null;
    let reason:string|undefined;
    let reasonValue:string|undefined;
    const workflow={...row.workflow,actionCode:action,additionalComment:comment.trim()||undefined};

    if(action==="take_in_work"){if(!ownerUserId)throw new Error("Назначьте ответственного за контакт.");targetStage="interview";workflow.outcomeCode="taken_in_work";nextAction=null;}
    if(action==="invalid_contact"){targetStage="rejected";reasonValue="invalid_contact";reason="Некорректный контакт";workflow.outcomeCode="invalid_contact";}
    if(action==="duplicate"){targetStage="rejected";reasonValue="duplicate";reason="Дубликат контакта";workflow.outcomeCode="duplicate";}

    if(action==="interested"){targetStage="documents";workflow.outcomeCode="interested";workflow.managerInterviewState=row.workflow?.managerInterviewState==="pending"?"completed":"not_required";}
    if(action==="callback"){targetStage="interview";workflow.outcomeCode="callback";nextAction=requireNext();}
    if(action==="no_answer"){targetStage="interview";workflow.outcomeCode="no_answer";workflow.contactAttempts=(row.workflow?.contactAttempts??0)+1;nextAction=requireNext();}
    if(action==="manager_interview"){
      if(!managerInterviewUserId)throw new Error("Выберите мастера или менеджера, который проведёт дополнительное интервью.");
      targetStage="interview";workflow.outcomeCode="manager_interview";workflow.managerInterviewState="pending";workflow.managerInterviewUserId=managerInterviewUserId;
      nextAction=requireNext();
    }
    if(action==="declined"||action==="not_suitable"){
      if(!reasonCode)throw new Error("Выберите причину завершения.");
      targetStage="rejected";reasonValue=reasonCode;workflow.outcomeCode=action;
    }

    if(action==="documents_wait"){targetStage="documents";workflow.outcomeCode="documents_wait";nextAction=requireNext();}
    if(action==="documents_complete"){
      const employment=documents?.filter(item=>item.groupType==="employment")??[];
      if(employment.some(item=>!["received","verified","ready","not_required"].includes(item.status)))throw new Error("Не все документы для оформления готовы.");
      targetStage=nextActiveStage("documents");workflow.outcomeCode="documents_complete";
    }
    if(action==="documents_stopped"){targetStage="rejected";reasonValue="documents";workflow.outcomeCode="documents_stopped";}

    if(action==="clearance_progress"){targetStage="clearance";workflow.outcomeCode="clearance_progress";nextAction=requireNext();}
    if(action==="clearance_complete"){
      const clearance=documents?.filter(item=>item.groupType==="clearance"&&item.blocksProgress)??[];
      if(clearance.some(item=>!["received","verified","ready","not_required"].includes(item.status)))throw new Error("Не готовы обязательные блокирующие допуски.");
      targetStage="preparation";workflow.outcomeCode="clearance_complete";
    }
    if(action==="clearance_failed"){
      if(!reasonCode)throw new Error("Выберите причину, по которой допуск не получен.");
      targetStage="rejected";reasonValue=reasonCode;workflow.outcomeCode="clearance_failed";
    }

    if(action==="preparation_save"||action==="ready_for_start"){
      targetStage=action==="ready_for_start"?"first_shift":"preparation";
      workflow.outcomeCode=action;
      workflow.travelState=travelState;
      workflow.arrivalAt=plannedArrival?new Date(plannedArrival).toISOString():undefined;
      workflow.ticketAssigneeUserId=ticketAssignee||undefined;
      workflow.ticketDueAt=ticketDue?new Date(ticketDue).toISOString():undefined;
      workflow.housingState=housingState;
      workflow.housingAssigneeUserId=housingAssignee||undefined;
      workflow.housingDueAt=housingDue?new Date(housingDue).toISOString():undefined;
      workflow.confirmed=action==="ready_for_start";
    }
    if(action==="preparation_declined"){targetStage="rejected";reasonValue="changed_mind";workflow.outcomeCode="preparation_declined";}

    let actualStartAt:string|null|undefined=undefined;
    if(action==="shift_worked"){
      if(!actualStart)throw new Error("Укажите фактическое время первого выхода.");
      targetStage="first_shift";workflow.outcomeCode="shift_worked";workflow.firstShiftOutcome="worked";actualStartAt=new Date(actualStart).toISOString();
    }
    if(action==="shift_no_show"){
      if(!reasonCode)throw new Error("Выберите причину невыхода.");
      targetStage="no_show";reasonValue=reasonCode;workflow.outcomeCode="shift_no_show";workflow.firstShiftOutcome="no_show";
    }
    if(action==="shift_not_admitted"){
      if(!reasonCode)throw new Error("Выберите причину недопуска.");
      targetStage="no_show";reasonValue=reasonCode;workflow.outcomeCode="shift_not_admitted";workflow.firstShiftOutcome="not_admitted";
    }

    setBusy("save");setError("");
    try{
      await saveApplicationChange(row,{
        stage:targetStage,
        workflow,
        nextActionAt:nextAction,
        plannedArrivalAt:plannedArrival?new Date(plannedArrival).toISOString():null,
        plannedStartDate:plannedStart||null,
        actualStartAt,
        reasonCode:reasonValue,
        reason,
        ownerUserId:action==="manager_interview"?managerInterviewUserId:(ownerUserId||null),
      },demo);
      router.refresh();onSaved?.();onClose();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить действие");}
    finally{setBusy("")}
  }

  async function moveToAlternative(){
    if(!alternativeNeedId)throw new Error("Выберите альтернативную потребность.");
    const target=activeNeeds.find(item=>item.id===alternativeNeedId);
    if(!target)throw new Error("Альтернативная потребность недоступна.");
    setBusy("alternative");setError("");
    try{
      if(demo){
        await saveApplicationChange(row,{stage:"rejected",reasonCode:"alternative_need",reason:"Переведён на другую вакансию",workflow:{...row.workflow,actionCode:"alternative_need",outcomeCode:"alternative_need",additionalComment:comment.trim()||undefined},nextActionAt:null},true);
        const now=new Date().toISOString();
        const created:RecruitingApplicationRow={
          ...row,
          applicationId:crypto.randomUUID(),needId:target.id,need:target.title,objectId:target.objectId,object:target.object,regionId:target.regionId,clientId:target.clientId,
          ownerUserId:target.ownerUserId,owner:target.owner,managerUserId:target.managerUserId,manager:target.manager,assigneeUserIds:target.assigneeUserIds,
          stage:"interview",stageLabel:stageLabel("interview"),conditions:target.conditions,nextAction:null,nextActionAt:null,plannedStartDate:null,plannedArrivalAt:null,actualStartAt:null,
          rejectionReason:null,rejectionReasonCode:null,createdAt:now,updatedAt:now,stageEnteredAt:now,
          workflow:{actionCode:"alternative_offer",outcomeCode:"needs_discussion"},stageEvents:[{fromStage:null,toStage:"interview",createdAt:now,reason:"Создана заявка на альтернативную вакансию"}],
          recentCommunications:row.recentCommunications,
          documentSummary:undefined,
        };
        saveDemoApplication(created);
      }else{
        const response=await fetch("/api/candidates/"+row.candidateId+"/alternative-need",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({applicationId:row.applicationId,needId:alternativeNeedId,comment:comment.trim()||null})});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось предложить другую вакансию");
      }
      router.refresh();onSaved?.();onClose();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось предложить другую вакансию");}
    finally{setBusy("")}
  }

  async function updateDocument(document:DocumentRow,patch:Partial<Pick<DocumentRow,"status"|"responsibleUserId"|"dueAt">>){
    const next={...document,...patch};
    if(demo){setDocuments(current=>(current??[]).map(item=>item.documentTypeId===document.documentTypeId?next:item));return;}
    setBusy(document.documentTypeId);setError("");
    try{
      const response=await fetch("/api/candidates/"+row.candidateId+"/documents",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
        applicationId:row.applicationId,documentTypeId:document.documentTypeId,status:next.status,responsibleUserId:next.responsibleUserId??null,dueAt:next.dueAt??null,
      })});
      const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error??"Не удалось обновить документ");
      setDocuments(current=>(current??[]).map(item=>item.documentTypeId===document.documentTypeId?next:item));
    }catch(e){setError(e instanceof Error?e.message:"Не удалось обновить документ");}
    finally{setBusy("")}
  }

  const visibleDocuments=documents?.filter(item=>
    row.stage==="documents"?item.groupType==="employment":
    row.stage==="clearance"?item.groupType==="clearance":
    row.stage==="preparation"?item.groupType==="clearance"&&!["received","verified","ready","not_required"].includes(item.status):
    false
  )??null;

  return <SalesDrawer title={row.fullName} subtitle={row.need+" · "+(row.object??"Без объекта")} onClose={()=>{if(!busy)onClose();}}>
    <div className="candidate-work-drawer">
      <section className="candidate-work-identity">
        <div><span>{row.stage==="new"?"Телефон":"Связь"}</span><strong>{row.stage==="new"?(row.phone??"Не указан"):preferredContact(row)}</strong></div>
        <div><span>Город</span><strong>{row.city??"Не указан"}</strong></div>
        {row.stage==="new"
          ? <div><span>Источник</span><strong>{sourceDisplay(row)}</strong></div>
          : <div><span>Канал связи</span><strong>{contactChannelLabel(row.preferredChannel)}</strong></div>}
        <div><span>Ответственный</span><strong>{row.owner??"Не назначен"}</strong></div>
      </section>

      <NeedSummary need={need} row={row}/>

      <section className="candidate-work-history">
        <header><div><h3>Последние события</h3><p>Что уже происходило с кандидатом</p></div><Link href={"/candidates/"+row.candidateId}>Полная история</Link></header>
        <div className="candidate-work-history-list">
          {(row.recentCommunications??[]).slice(0,4).map(item=><div key={item.id}><time>{item.happenedAt}</time><span><strong>{item.author}</strong><small>{item.summary}</small></span></div>)}
          {row.stageEvents?.slice(-2).reverse().map((item,index)=><div key={"stage-"+index}><time>{formatWorkDate(item.createdAt)}</time><span><strong>Система</strong><small>Этап: {stageLabel(item.toStage as RecruitingStage)}{item.reason?" · "+item.reason:""}</small></span></div>)}
        </div>
      </section>

      {visibleDocuments!==null&&showDocumentsAtStage(row.stage)&&<DocumentChecklist documents={visibleDocuments} recruiters={recruiters} canEdit={canEdit} busy={busy} onChange={updateDocument}/>}

      {error&&<div role="alert" className="recruiting-error">{error}</div>}

      {row.stage==="retention_7"||row.stage==="retention_30"
        ? <section className="candidate-stage-actions candidate-retention-panel"><h3>{row.stage==="retention_7"?"Контроль 7 дней":"Контроль 30 дней"}</h3><p>Этот этап уже привязан к факту первого выхода. Следующим шагом будет автоматическая синхронизация с табелем и событием выбытия сотрудника.</p></section>
        : <section className="candidate-stage-actions">
          <header><div><span className="eyebrow">{stageLabel(row.stage)}</span><h3>Результат текущего этапа</h3></div>{risks.length>0&&<span className="candidate-action-risk">{risks[0]}</span>}</header>
          <div className="candidate-action-grid">{(stageActions[row.stage]??[]).map(option=><button type="button" key={option.code} className={"candidate-action-choice "+(action===option.code?"active ":"")+(option.tone==="danger"?"danger":"")} onClick={()=>{setAction(option.code);setError("")}} disabled={!canEdit}><strong>{option.label}</strong><small>{option.hint}</small></button>)}</div>

          <div className="candidate-action-fields">
            {recruiters.length>0&&<label>Текущий ответственный<select value={ownerUserId} onChange={e=>setOwnerUserId(e.target.value)}><option value="">Не назначен</option>{recruiters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}

            {["callback","no_answer","manager_interview","documents_wait","clearance_progress"].includes(action)&&<label>Когда вернуться к кандидату<input type="datetime-local" value={nextAt} onChange={e=>setNextAt(e.target.value)}/></label>}
            {action==="manager_interview"&&<label>Кто проводит дополнительное интервью<select value={managerInterviewUserId} onChange={e=>setManagerInterviewUserId(e.target.value)}><option value="">Выберите</option>{recruiters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}

            {action==="alternative_need"&&<label className="wide">Альтернативная вакансия<select value={alternativeNeedId} onChange={e=>setAlternativeNeedId(e.target.value)}><option value="">Выберите потребность</option>{activeNeeds.map(item=><option key={item.id} value={item.id}>{item.title} · {item.object??item.region??"без объекта"} · найти {item.toRecruit}</option>)}</select></label>}

            {["declined","not_suitable","clearance_failed","shift_no_show","shift_not_admitted"].includes(action)&&<label className="wide">Причина<select value={reasonCode} onChange={e=>setReasonCode(e.target.value)}><option value="">Выберите причину</option>{exitReasons.filter(item=>action==="shift_no_show"||action==="shift_not_admitted"?item.kind==="no_show"||item.kind==="both":item.kind==="rejected"||item.kind==="both").map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label>}

            {row.stage==="preparation"&&<PreparationFields
              plannedArrival={plannedArrival} setPlannedArrival={setPlannedArrival}
              plannedStart={plannedStart} setPlannedStart={setPlannedStart}
              travelState={travelState} setTravelState={setTravelState}
              ticketAssignee={ticketAssignee} setTicketAssignee={setTicketAssignee}
              ticketDue={ticketDue} setTicketDue={setTicketDue}
              housingState={housingState} setHousingState={setHousingState}
              housingAssignee={housingAssignee} setHousingAssignee={setHousingAssignee}
              housingDue={housingDue} setHousingDue={setHousingDue}
              recruiters={recruiters} housingProvided={housingProvided}
            />}

            {action==="shift_worked"&&<label>Фактическое время выхода<input type="datetime-local" value={actualStart} onChange={e=>setActualStart(e.target.value)}/></label>}

            {action&&<label className="wide">Дополнительный комментарий<textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Только если нужной информации нет в структурированных полях"/></label>}
          </div>

          <div className="candidate-action-footer"><span>{action?"Система сама зафиксирует результат, этап и историю.":"Выберите результат — появятся только необходимые поля."}</span>{action&&<button className="button primary" type="button" disabled={Boolean(busy)||(!canConvert&&action==="shift_worked")} onClick={()=>void performAction()}>{busy?"Сохраняю…":action==="alternative_need"?"Перевести на вакансию":"Сохранить результат"}</button>}</div>
        </section>}

      <div className="recruiting-form-actions candidate-drawer-links"><Link className="button" href={"/candidates/"+row.candidateId}><UserRound size={14}/> Полная карточка</Link>{row.phone&&<a className="button" href={"tel:"+row.phone}><PhoneCall size={14}/> Позвонить</a>}</div>
    </div>
  </SalesDrawer>;
}

function DocumentChecklist({documents,recruiters,canEdit,busy,onChange}:{documents:DocumentRow[];recruiters:Array<{id:string;name:string}>;canEdit:boolean;busy:string;onChange:(document:DocumentRow,patch:Partial<Pick<DocumentRow,"status"|"responsibleUserId"|"dueAt">>)=>void}){
  const group=documents[0]?.groupType;
  const ready=documents.filter(item=>["received","verified","ready","not_required"].includes(item.status)).length;
  return <section className="candidate-documents">
    <header><div><h3>{group==="clearance"?"Дополнительные документы и допуски":"Документы для оформления"}</h3><p>Готово {ready} из {documents.length}. Неблокирующие требования могут выполняться параллельно следующим этапам.</p></div></header>
    <div>{documents.map(document=>{
      const statuses=document.provider==="candidate"
        ? ["missing","requested","received","verified","not_required"]
        : ["to_prepare","in_progress","ready","not_required"];
      const companyTask=document.groupType==="clearance"&&document.provider!=="candidate"&&!["ready","not_required"].includes(document.status);
      return <div className="candidate-document-row candidate-document-row-v2" key={document.documentTypeId}>
        <div className="candidate-document-meta"><strong>{document.name}</strong><small>{providerLabels[document.provider]} · {document.requiredByStage?deadlineLabel(document.requiredByStage):"Срок не задан"}{document.blocksProgress?" · блокирует":""}</small></div>
        <select value={document.status} disabled={!canEdit||busy===document.documentTypeId} onChange={e=>void onChange(document,{status:e.target.value})}>{statuses.map(status=><option key={status} value={status}>{statusLabels[status]??status}</option>)}</select>
        {companyTask&&<div className="candidate-document-task"><select aria-label={"Ответственный: "+document.name} value={document.responsibleUserId??""} disabled={!canEdit||busy===document.documentTypeId} onChange={e=>void onChange(document,{responsibleUserId:e.target.value||null})}><option value="">Ответственный</option>{recruiters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label={"Срок: "+document.name} type="datetime-local" value={localDate(document.dueAt)} disabled={!canEdit||busy===document.documentTypeId} onChange={e=>void onChange(document,{dueAt:e.target.value?new Date(e.target.value).toISOString():null})}/></div>}
      </div>;
    })}</div>
  </section>;
}

function PreparationFields({
  plannedArrival,setPlannedArrival,plannedStart,setPlannedStart,travelState,setTravelState,ticketAssignee,setTicketAssignee,ticketDue,setTicketDue,
  housingState,setHousingState,housingAssignee,setHousingAssignee,housingDue,setHousingDue,recruiters,housingProvided,
}:{
  plannedArrival:string;setPlannedArrival:(value:string)=>void;plannedStart:string;setPlannedStart:(value:string)=>void;
  travelState:"not_required"|"self"|"company"|"ticket_required"|"ticket_bought";setTravelState:(value:"not_required"|"self"|"company"|"ticket_required"|"ticket_bought")=>void;ticketAssignee:string;setTicketAssignee:(value:string)=>void;ticketDue:string;setTicketDue:(value:string)=>void;
  housingState:"not_required"|"needs_booking"|"booked";setHousingState:(value:"not_required"|"needs_booking"|"booked")=>void;housingAssignee:string;setHousingAssignee:(value:string)=>void;housingDue:string;setHousingDue:(value:string)=>void;
  recruiters:Array<{id:string;name:string}>;housingProvided:boolean;
}){
  return <>
    <div className="candidate-preparation-dates wide"><label>Плановое прибытие<input type="datetime-local" value={plannedArrival} onChange={e=>setPlannedArrival(e.target.value)}/></label><label>Плановый первый выход<input type="date" value={plannedStart} onChange={e=>setPlannedStart(e.target.value)}/></label></div>
    <label>Как добирается<select value={travelState} onChange={e=>setTravelState(e.target.value as "not_required"|"self"|"company"|"ticket_required"|"ticket_bought")}><option value="not_required">Прибытие не требуется / местный</option><option value="self">Самостоятельно</option><option value="company">Транспорт организует компания</option><option value="ticket_required">Нужно купить билет</option><option value="ticket_bought">Билет уже куплен</option></select></label>
    {(travelState==="ticket_required"||travelState==="ticket_bought")&&<><label>Ответственный за билет<select value={ticketAssignee} onChange={e=>setTicketAssignee(e.target.value)}><option value="">Выберите</option>{recruiters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Билет купить до<input type="datetime-local" value={ticketDue} onChange={e=>setTicketDue(e.target.value)}/></label></>}
    <label>Размещение<select value={housingState} onChange={e=>setHousingState(e.target.value as "not_required"|"needs_booking"|"booked")}><option value="not_required">Не требуется</option><option value="needs_booking">{housingProvided?"Нужно забронировать место":"Нужно организовать жильё"}</option><option value="booked">Место подтверждено</option></select></label>
    {(housingState==="needs_booking"||housingState==="booked")&&<><label>Ответственный за жильё<select value={housingAssignee} onChange={e=>setHousingAssignee(e.target.value)}><option value="">Выберите</option>{recruiters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Подтвердить жильё до<input type="datetime-local" value={housingDue} onChange={e=>setHousingDue(e.target.value)}/></label></>}
  </>;
}

function showDocumentsAtStage(stage:RecruitingStage){return ["documents","clearance","preparation"].includes(stage);}

function buildDemoDocuments(row:RecruitingApplicationRow):DocumentRow[]{
  const employment=[
    {id:"demo-doc-passport",name:"Паспорт",provider:"candidate" as const},
    {id:"demo-doc-snils",name:"СНИЛС",provider:"candidate" as const},
    {id:"demo-doc-inn",name:"ИНН",provider:"candidate" as const},
    {id:"demo-doc-bank",name:"Банковские реквизиты",provider:"candidate" as const},
  ];
  const clearance=[
    {id:"demo-doc-medical",name:"Медицинская комиссия",provider:"company" as const},
    {id:"demo-doc-qualification",name:"Удостоверение / допуск",provider:"candidate" as const},
  ];
  const employmentReady=Math.min(row.documentSummary?.employmentReady??(row.stage==="documents"?2:4),4);
  const clearanceReady=Math.min(row.documentSummary?.clearanceReady??(["preparation","first_shift","retention_7","retention_30"].includes(row.stage)?2:0),2);
  return [
    ...employment.map((item,index)=>({documentTypeId:item.id,name:item.name,groupType:"employment" as const,provider:item.provider,status:index<employmentReady?"received":"requested",note:null,requiredByStage:"documents" as const,blocksProgress:true})),
    ...clearance.map((item,index)=>({documentTypeId:item.id,name:item.name,groupType:"clearance" as const,provider:item.provider,status:index<clearanceReady?(item.provider==="candidate"?"received":"ready"):(item.provider==="candidate"?"requested":"to_prepare"),note:null,requiredByStage:index===0?"first_shift" as const:"retention_7" as const,blocksProgress:false})),
  ];
}

function NeedSummary({need,row}:{need:RecruitingNeedRow|null;row:RecruitingApplicationRow}){
  const c=need?.conditions??row.conditions;
  return <section className="candidate-work-need">
    <header><div><h3>Условия вакансии</h3><p>{(need?.title??row.need)+" · "+(need?.object??row.object??need?.region??"Без локации")}</p></div><Link href="/needs?view=needs">Потребность</Link></header>
    <div className="candidate-work-pay"><span>На руки</span><strong>{display(c.workerPay)}</strong></div>
    <dl><div><dt>График</dt><dd>{display(c.schedule)}</dd></div><div><dt>Смена</dt><dd>{display(c.shift)}</dd></div><div><dt>Проживание</dt><dd>{provision(c,"housing")}</dd></div><div><dt>Питание</dt><dd>{provision(c,"meals")}</dd></div><div><dt>Проезд</dt><dd>{provision(c,"travel")}</dd></div><div><dt>Развозка</dt><dd>{provision(c,"shuttle")}</dd></div></dl>
  </section>;
}

function preferredContact(row:RecruitingApplicationRow){
  if(row.preferredContact)return row.preferredContact;
  if(row.preferredChannel==="telegram")return row.telegram??row.phone??"Не указан";
  if(row.preferredChannel==="whatsapp")return row.whatsapp??row.phone??"Не указан";
  if(row.preferredChannel==="email")return row.email??row.phone??"Не указан";
  return row.phone??row.email??"Не указан";
}
function contactChannelLabel(value:string|null){return value==="telegram"?"Telegram":value==="whatsapp"?"WhatsApp":value==="max"?"MAX":value==="email"?"Email":value==="phone"?"Телефон":"Контакт";}
function sourceDisplay(row:RecruitingApplicationRow){const source=row.source?.trim()??"";const channel=row.sourceChannel?.trim()??"";return !source&&!channel?"Не указан":source&&channel&&source.toLocaleLowerCase("ru")===channel.toLocaleLowerCase("ru")?source:[source,channel].filter(Boolean).join(" · ");}

function deadlineLabel(value:string){return value==="documents"?"до оформления":value==="preparation"?"до подготовки":value==="first_shift"?"до первого выхода":value==="retention_7"?"до 7-го дня":value==="retention_30"?"до 30-го дня":"без жёсткого срока";}
function provision(c:Record<string,unknown>,key:string){const explicit=c[key+"Provided"];const detail=display(c[key]);if(explicit===true)return detail==="—"?"Предоставляется":detail;if(explicit===false)return detail==="—"?"Не предоставляется":detail;return detail;}
function display(value:unknown){if(value==null||value==="")return"—";if(typeof value==="string"||typeof value==="number")return String(value);return JSON.stringify(value);}
function localDate(value?:string|null){if(!value||!Number.isFinite(Date.parse(value)))return"";const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
