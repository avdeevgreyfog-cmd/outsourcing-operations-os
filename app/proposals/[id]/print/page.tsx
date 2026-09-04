import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { getCommercialProposalDetail } from "@/lib/commercial/proposal-document";
import { ProposalPrintButton } from "@/components/ProposalPrintButton";
import { rub, vatModeLabel } from "@/lib/ui/format";

const unitLabels:Record<string,string>={hour:"час",shift:"смена",unit:"единица",worker_month:"сотрудник / месяц",project_month:"проект / месяц",project_fixed:"проект",mixed:"переменная единица"};

export default async function ProposalPrintPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const actor=await requireActor();
  const proposal=await getCommercialProposalDetail(actor,id);
  if(!proposal)notFound();
  const content=proposal.content;const roles=content.roles??[];
  return <main className="proposal-print-page">
    <style>{`
      body{background:#eef1f4;margin:0;font-family:Arial,Helvetica,sans-serif;color:#17191c}.proposal-print-page{max-width:920px;margin:32px auto;background:#fff;box-shadow:0 8px 32px rgba(0,0,0,.08);padding:54px 62px}.proposal-print-toolbar{display:flex;justify-content:flex-end;margin-bottom:26px}.proposal-print-button{border:1px solid #cfd5dc;background:#fff;padding:9px 14px;border-radius:6px;font-weight:600;cursor:pointer}.proposal-print-brand{font-size:13px;font-weight:800;letter-spacing:.12em}.proposal-print-kicker{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#6c727a;margin-top:28px}.proposal-print-page h1{font-size:34px;line-height:1.08;margin:8px 0 10px}.proposal-print-subtitle{font-size:17px;color:#555d66;max-width:700px;line-height:1.5}.proposal-print-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;border-top:1px solid #e2e6ea;border-bottom:1px solid #e2e6ea;padding:18px 0;margin:28px 0}.proposal-print-meta span,.proposal-print-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#777f88}.proposal-print-meta strong{display:block;margin-top:6px;font-size:14px}.proposal-print-section{margin-top:32px}.proposal-print-section h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;margin:0 0 14px}.proposal-print-table{width:100%;border-collapse:collapse}.proposal-print-table th{font-size:11px;text-align:left;text-transform:uppercase;letter-spacing:.05em;color:#717780;background:#f5f7f9;padding:10px;border-bottom:1px solid #dfe3e7}.proposal-print-table td{padding:12px 10px;border-bottom:1px solid #e5e8eb;font-size:14px}.proposal-print-list{display:grid;grid-template-columns:1fr 1fr;gap:10px}.proposal-print-item{border:1px solid #e1e5e9;padding:12px 14px;font-size:14px}.proposal-print-item b{font-size:11px;margin-right:8px;color:#727983}.proposal-print-text{font-size:14px;line-height:1.65;white-space:pre-wrap}.proposal-print-footer{border-top:1px solid #e1e5e9;margin-top:38px;padding-top:18px;font-size:12px;color:#656d75}.proposal-print-note{font-size:12px;color:#6c727a;margin-top:8px}
      @media print{body{background:#fff}.proposal-print-page{box-shadow:none;margin:0;max-width:none;padding:18mm 16mm}.proposal-print-toolbar{display:none}@page{size:A4;margin:0}}
    `}</style>
    <div className="proposal-print-toolbar"><ProposalPrintButton/></div>
    <div className="proposal-print-brand">OPERIS</div>
    <div className="proposal-print-kicker">Коммерческое предложение · версия {proposal.version}</div>
    <h1>{content.objectName??content.title??proposal.request}</h1>
    <div className="proposal-print-subtitle">{content.description??"Коммерческое предложение по предоставлению персонала и организации работ."}</div>
    <div className="proposal-print-meta">
      <div><span>Компания</span><strong>{content.company??proposal.client}</strong></div>
      <div><span>Локация</span><strong>{content.location??"Не указана"}</strong></div>
      <div><span>Плановый старт</span><strong>{content.expectedStartDate??"По согласованию"}</strong></div>
      <div><span>График / объём</span><strong>{content.schedule??"По согласованию"}</strong></div>
      <div><span>НДС</span><strong>{content.vatMode?`${vatModeLabel(content.vatMode)}${content.vatPct?` · ${content.vatPct}%`:""}`:"Не указан"}</strong></div>
      <div><span>Срок действия</span><strong>{content.validUntil??"До изменения условий"}</strong></div>
    </div>

    <section className="proposal-print-section"><h2>Стоимость услуг</h2><table className="proposal-print-table"><thead><tr><th>Услуга / позиция</th><th>Количество</th><th>Без НДС</th><th>С НДС</th><th>Единица</th></tr></thead><tbody>{roles.map((role)=><tr key={role.scenarioId}><td>{role.role}</td><td>{role.count}</td><td>{rub(role.rateNet)}</td><td>{rub(role.rateGross)}</td><td>{unitLabels[role.unit]??role.unit}</td></tr>)}</tbody></table><div className="proposal-print-note">Ставки сформированы из согласованных расчётных сценариев, связанных с этой версией коммерческого предложения.</div></section>

    {!!content.included?.length&&<section className="proposal-print-section"><h2>В ставку включено</h2><div className="proposal-print-list">{content.included.map((item,index)=><div className="proposal-print-item" key={`${item}-${index}`}><b>{String(index+1).padStart(2,"0")}</b>{item}</div>)}</div></section>}
    {!!content.clientProvides?.length&&<section className="proposal-print-section"><h2>Предоставляет заказчик</h2><div className="proposal-print-list">{content.clientProvides.map((item,index)=><div className="proposal-print-item" key={`${item}-${index}`}><b>{String(index+1).padStart(2,"0")}</b>{item}</div>)}</div></section>}
    {content.terms&&<section className="proposal-print-section"><h2>Условия сотрудничества</h2><div className="proposal-print-text">{content.terms}</div></section>}
    {content.additionalConditions&&<section className="proposal-print-section"><h2>Дополнительные условия</h2><div className="proposal-print-text">{content.additionalConditions}</div></section>}
    {content.comment&&<section className="proposal-print-section"><h2>Комментарий</h2><div className="proposal-print-text">{content.comment}</div></section>}
    <footer className="proposal-print-footer">Коммерческое предложение сформировано в Outsourcing Operations OS. В документ не включаются внутренняя себестоимость, зарплатная экономика, маржинальность, внутренние комментарии и правила согласования.</footer>
  </main>;
}
