"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SubmitApprovalButton } from "@/components/CommercialWorkflowActions";
import { Section, Status } from "@/components/UI";
import type { ContractDetail } from "@/lib/commercial/contracts";
import { rub } from "@/lib/ui/format";

const statusLabels:Record<string,string>={draft:"Черновик",negotiation:"Переговоры",internal_review:"Внутреннее согласование",approved:"Согласовано внутри",signing:"На подписании",signed:"Подписан",rejected:"На доработке",terminated:"Завершён",expired:"Истёк"};
const kindLabels:Record<string,string>={master:"Основной договор",framework:"Рамочный договор",specification:"Спецификация",addendum:"Доп. соглашение"};
const gateLabels:Record<string,string>={blocked:"Фактический запуск заблокирован",ready:"Договорное основание подтверждено",exception:"Запуск разрешён исключением"};

function statusTone(status:string){if(status==="signed")return "good" as const;if(["rejected","terminated","expired"].includes(status))return "bad" as const;if(["approved","signing"].includes(status))return "info" as const;if(status==="internal_review")return "warn" as const;return "neutral" as const;}
function gateTone(gate:string){return gate==="ready"?"good" as const:gate==="exception"?"warn" as const:"neutral" as const;}

async function api(url:string,method:string,body:unknown){const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Операция не выполнена");return json;}

export function ContractDetailWorkspace({contract,canEdit,canSubmit,canSign,canException}:{contract:ContractDetail;canEdit:boolean;canSubmit:boolean;canSign:boolean;canException:boolean}){
  const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [exceptionReason,setExceptionReason]=useState("");
  const editable=canEdit&&["draft","negotiation","rejected"].includes(contract.status);
  async function run(action:string,extra:Record<string,unknown>={}){try{setBusy(true);setMessage("");await api(`/api/contracts/${contract.id}`,"PATCH",{action,...extra});router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"Ошибка");}finally{setBusy(false)}}
  async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);const delay=String(form.get("paymentDelayDays")??"").trim();await run("edit",{
    title:String(form.get("title")??""),number:String(form.get("number")??"").trim()||null,kind:String(form.get("kind")??"master"),parentContractId:String(form.get("parentContractId")??"").trim()||null,
    effectiveFrom:String(form.get("effectiveFrom")??"").trim()||null,effectiveTo:String(form.get("effectiveTo")??"").trim()||null,
    paymentTerms:String(form.get("paymentTerms")??"").trim()||null,paymentDelayDays:delay?Number(delay):null,billingBasis:String(form.get("billingBasis")??"").trim()||null,
    timesheetRule:String(form.get("timesheetRule")??"").trim()||null,minimumVolume:String(form.get("minimumVolume")??"").trim()||null,sla:String(form.get("sla")??"").trim()||null,
    penalties:String(form.get("penalties")??"").trim()||null,notes:String(form.get("notes")??"").trim()||null,documentReference:String(form.get("documentReference")??"").trim()||null,
  });}
  const roles=Array.isArray(contract.terms.roles)?contract.terms.roles:[];
  return <div className="contract-detail-layout">
    <div className="contract-detail-main">
      <Section title="Состояние сделки" note="Подбор и планирование запуска могут идти параллельно договорной работе; фактический запуск контролируется договорным допуском.">
        <div className="contract-state-grid">
          <div><span>Договор</span><Status tone={statusTone(contract.status)}>{statusLabels[contract.status]??contract.status}</Status></div>
          <div><span>Допуск запуска</span><Status tone={gateTone(contract.launchGate)}>{gateLabels[contract.launchGate]??contract.launchGate}</Status></div>
          <div><span>Текущая версия</span><strong>v{contract.version}</strong></div>
          <div><span>Подписан</span><strong>{contract.signedAt?new Date(contract.signedAt).toLocaleDateString("ru-RU"):"—"}</strong></div>
        </div>
        {contract.launchGate==="blocked"&&<div className="contract-blocker">Объект находится в подготовке. Потребности и задачи запуска уже могут исполняться, но фактический запуск должен быть разблокирован подписанным договором или отдельным разрешением.</div>}
        {contract.launchGate==="exception"&&<div className="contract-exception"><strong>Запуск разрешён без подписанного договора</strong><span>{contract.launchExceptionReason||"Причина не указана"}</span>{contract.launchExceptionBy&&<small>{contract.launchExceptionBy}{contract.launchExceptionAt?` · ${new Date(contract.launchExceptionAt).toLocaleString("ru-RU")}`:""}</small>}</div>}
      </Section>

      <Section title="Коммерческие условия" note="Ставки зафиксированы из принятой версии КП. Если клиент меняет цену, корректный путь — новый расчёт и новая версия КП, а не ручное изменение подписываемой экономики.">
        {roles.length?<div className="commercial-table-wrap"><table className="data-table contract-rates-table"><thead><tr><th>Позиция</th><th>Количество</th><th>Ставка без НДС</th><th>Ставка с НДС</th><th>Единица</th></tr></thead><tbody>{roles.map((role,index)=><tr key={`${role.scenarioId??role.role}-${index}`}><td><strong>{role.role}</strong></td><td className="num">{role.count}</td><td className="num">{rub(Number(role.rateNet||0))}</td><td className="num">{role.rateGross?rub(Number(role.rateGross)):"—"}</td><td>{role.unit}</td></tr>)}</tbody></table></div>:<div className="cell-sub">В текущем snapshot нет строк ставок.</div>}
      </Section>

      <Section title="Условия договора" note={editable?"Сохранение создаёт новую версию условий; предыдущая остаётся в истории.":"Изменение условий сейчас недоступно на текущем этапе."}>
        <form className="contract-form" onSubmit={save}>
          <label className="contract-form-wide">Название<input name="title" className="input" defaultValue={contract.title} disabled={!editable}/></label>
          <label>Номер<input name="number" className="input" defaultValue={contract.number??""} disabled={!editable} placeholder="Присваивается при необходимости"/></label>
          <label>Тип<select name="kind" defaultValue={contract.kind} disabled={!editable}>{Object.entries(kindLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
          <label className="contract-form-wide">Рамочный договор<select name="parentContractId" defaultValue={contract.parentContractId??""} disabled={!editable}><option value="">Не связан</option>{contract.frameworkOptions.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <label>Действует с<input name="effectiveFrom" type="date" className="input" defaultValue={contract.effectiveFrom??""} disabled={!editable}/></label>
          <label>Действует по<input name="effectiveTo" type="date" className="input" defaultValue={contract.effectiveTo??""} disabled={!editable}/></label>
          <label className="contract-form-wide">Условия оплаты<textarea name="paymentTerms" className="input" defaultValue={contract.terms.paymentTerms??""} disabled={!editable}/></label>
          <label>Отсрочка, дней<input name="paymentDelayDays" type="number" min="0" className="input" defaultValue={contract.terms.paymentDelayDays??""} disabled={!editable}/></label>
          <label>Основание биллинга<input name="billingBasis" className="input" defaultValue={contract.terms.billingBasis??""} disabled={!editable}/></label>
          <label className="contract-form-wide">Правило табелирования<textarea name="timesheetRule" className="input" defaultValue={contract.terms.timesheetRule??""} disabled={!editable}/></label>
          <label className="contract-form-wide">Минимальный объём / платёж<input name="minimumVolume" className="input" defaultValue={contract.terms.minimumVolume??""} disabled={!editable}/></label>
          <label className="contract-form-wide">SLA<textarea name="sla" className="input" defaultValue={contract.terms.sla??""} disabled={!editable}/></label>
          <label className="contract-form-wide">Штрафы и ответственность<textarea name="penalties" className="input" defaultValue={contract.terms.penalties??""} disabled={!editable}/></label>
          <label className="contract-form-wide">Ссылка / номер файла<input name="documentReference" className="input" defaultValue={contract.documentReference??""} disabled={!editable} placeholder="Ссылка на ЭДО, Drive или внутренний идентификатор"/></label>
          <label className="contract-form-wide">Комментарий<textarea name="notes" className="input" defaultValue={contract.terms.notes??""} disabled={!editable}/></label>
          {editable&&<div className="contract-form-actions"><button className="button primary" disabled={busy} type="submit">Сохранить новую версию</button></div>}
        </form>
      </Section>

      <Section title="История версий" note="Подписанная версия не изменяется задним числом.">
        <div className="contract-version-list">{contract.versions.map(version=><article key={version.id}><div><strong>Версия {version.version}</strong><span>{version.status==="signed"?"Подписана":version.status==="superseded"?"Предыдущая версия":"Черновик"}</span></div><div><span>{version.createdAt} · {version.createdBy}</span>{version.documentReference&&<small>{version.documentReference}</small>}</div></article>)}</div>
      </Section>
    </div>

    <aside className="contract-detail-aside"><Section title="Действия"><div className="proposal-side-body">
      {canSubmit&&["draft","negotiation","rejected"].includes(contract.status)&&<SubmitApprovalButton subjectType="contract" subjectId={contract.id} label="На внутреннее согласование"/>}
      {canEdit&&contract.status==="approved"&&<button className="button primary" disabled={busy} onClick={()=>void run("signing")}>Передать на подписание</button>}
      {canEdit&&["approved","signing"].includes(contract.status)&&<button className="button" disabled={busy} onClick={()=>void run("negotiate")}>Вернуть в переговоры</button>}
      {canSign&&["approved","signing"].includes(contract.status)&&<button className="button primary" disabled={busy} onClick={()=>void run("sign")}>Отметить как подписанный</button>}
      {canException&&contract.launchGate==="blocked"&&contract.status!=="signed"&&<div className="contract-exception-action"><textarea rows={3} value={exceptionReason} onChange={event=>setExceptionReason(event.target.value)} placeholder="Причина запуска без подписанного договора"/><button className="button" disabled={busy||exceptionReason.trim().length<5} onClick={()=>void run("launch_exception",{reason:exceptionReason})}>Разрешить запуск исключением</button></div>}
      {message&&<div className="form-error">{message}</div>}
    </div></Section></aside>
  </div>;
}
