"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Empty, KeyValue, Section, SummaryStrip } from "@/components/UI";
import { getDemoRequest, subscribeDemoRequests, type DemoRequestRecord } from "@/lib/commercial/demo-workspace-client";
import { normalizeRequestIntake, provisionKeys } from "@/lib/commercial/request-intake";
import { defaultRequestStages } from "@/lib/commercial/request-workflow";

const provisionLabels: Record<(typeof provisionKeys)[number], string> = {housing:"Проживание",travel:"Проезд",shuttle:"Развозка",meals:"Питание",workwear:"Спецодежда",ppe:"СИЗ",tools:"Инструмент",consumables:"Расходные материалы",medical:"Медосмотр",medbook:"Медицинская книжка",training:"Обучение"};
const providerLabels: Record<string, string> = {client:"Заказчик",us:"Мы",not_required:"Не требуется",unknown:"Уточняется"};
const categoryLabels: Record<string,string> = {rf:"РФ",eaeu:"ЕАЭС",foreign_with_docs:"Иностранные граждане с документами",client_rules:"По требованиям заказчика"};
const checkLabels: Record<string,string> = {security:"Служба безопасности",document_check:"Проверка документов",qualification:"Проверка квалификации",medical:"Медосмотр",medbook:"Медицинская книжка",labor_safety:"Охрана труда",industrial_safety:"Промышленная безопасность",certificates:"Удостоверения / допуски",pass_docs:"Документы для проходной"};
function display(value:unknown){return typeof value==="string"&&value.trim()?value:typeof value==="number"?String(value):"—";}

export function DemoRequestPreview({id,canEdit}:{id:string;canEdit:boolean}){
  const [record,setRecord]=useState<DemoRequestRecord|null>(null);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    const sync=()=>{setRecord(getDemoRequest(id));setLoaded(true);};
    const timer=window.setTimeout(sync,0);
    const unsubscribe=subscribeDemoRequests(sync);
    return ()=>{window.clearTimeout(timer);unsubscribe();};
  },[id]);
  if(!loaded)return <p role="status">Загружаю сохранённую заявку…</p>;
  if(!record)return <Empty title="Заявка недоступна" text="В этом браузере нет сохранённой демонстрационной заявки с таким идентификатором." action={<Link href="/requests" className="button">К реестру заявок</Link>}/>;
  const {payload,board}=record;
  const intake=normalizeRequestIntake(payload.intake);
  const stage=defaultRequestStages.find((item)=>item.code===board.workflowStageCode)?.label??"Этап не указан";
  return <div className="sales-workspace">
    <Section title={payload.title} note="Сохранённые демонстрационные данные этого браузера." actions={<div className="page-actions"><Link href="/requests" className="button">К реестру</Link>{canEdit&&<Link href={`/requests/new?draft=${encodeURIComponent(id)}`} className="button primary">Редактировать</Link>}</div>}>
      <SummaryStrip><KeyValue label="Клиент" value={board.client}/><KeyValue label="Этап" value={stage}/><KeyValue label="Ответственный" value={display(board.owner)}/><KeyValue label="Плановый старт" value={payload.startDate?new Date(`${payload.startDate}T00:00:00`).toLocaleDateString("ru-RU"):"—"}/></SummaryStrip>
      <SummaryStrip><KeyValue label="Компания / рабочее название" value={display(intake.companyName)}/><KeyValue label="Адрес объекта" value={display(payload.location)}/><KeyValue label="Срок работ" value={display(payload.durationText)}/><KeyValue label="Источник" value={payload.source==="manual"?"Ручной ввод":payload.source==="public_form"?"Внешняя форма":display(payload.source)}/></SummaryStrip>
    </Section>
    <Section title="Контакт заказчика"><SummaryStrip><KeyValue label="Контактное лицо" value={display(intake.contact.name)}/><KeyValue label="Телефон" value={display(intake.contact.phone)}/><KeyValue label="Эл. почта" value={display(intake.contact.email)}/><KeyValue label="Мессенджеры" value={intake.contact.messengers.map((item)=>`${item.type}: ${item.value}`).join("; ")||"—"}/></SummaryStrip></Section>
    <Section title="Позиции"><div className="table-wrap"><table><thead><tr><th>Специальность</th><th>Количество</th><th>График</th><th>Ориентир ставки клиента</th></tr></thead><tbody>{payload.roles.map((role,index)=><tr key={role.id??index}><td>{role.specialtyName}</td><td>{role.count}</td><td>{display(role.schedule.pattern??intake.schedule.pattern)}</td><td>{role.targetClientRate==null?"—":`${role.targetClientRate.toLocaleString("ru-RU")} ₽`}</td></tr>)}</tbody></table></div></Section>
    <Section title="График и обеспечение"><SummaryStrip><KeyValue label="Общий график" value={display(intake.schedule.pattern==="custom"?intake.schedule.customPattern:intake.schedule.pattern)}/><KeyValue label="Смена" value={intake.schedule.shiftStart&&intake.schedule.shiftEnd?`${intake.schedule.shiftStart}–${intake.schedule.shiftEnd}`:"—"}/><KeyValue label="Оплачиваемые часы" value={display(intake.schedule.paidHours)}/><KeyValue label="Обед оплачивается" value={intake.schedule.lunchPaid?"Да":"Нет"}/></SummaryStrip><SummaryStrip>{provisionKeys.map((key)=><KeyValue key={key} label={provisionLabels[key]} value={providerLabels[intake.provision[key].provider]??"Уточняется"}/>)}</SummaryStrip></Section>
    <Section title="Требования и коммерческие условия"><SummaryStrip><KeyValue label="Категории работников" value={intake.compliance.workerCategories.map((item)=>categoryLabels[item]??"По отдельным требованиям").join(", ")||"—"}/><KeyValue label="Проверки" value={intake.compliance.documentChecks.map((item)=>checkLabels[item]??"По отдельным требованиям").join(", ")||"—"}/><KeyValue label="Условия оплаты" value={display(intake.commercial.paymentTerms)}/><KeyValue label="Лимит ставки клиента" value={display(intake.commercial.clientLimit)}/></SummaryStrip>{intake.compliance.comment&&<p>{intake.compliance.comment}</p>}</Section>
    <Section title="Комментарий"><p>{payload.comments||"Комментарий не указан"}</p></Section>
  </div>;
}
