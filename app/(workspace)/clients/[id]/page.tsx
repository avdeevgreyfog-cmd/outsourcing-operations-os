import {isGithubPagesDemo} from "@/lib/demo/pages";
import Link from "next/link";
import type {ReactNode} from "react";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {getClientEditOptions,listCalculations,listClientContacts,listClients,listFinance,listObjects,listProposals,listRequests} from "@/lib/data/service";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {Empty,EntityTabs,KeyValue,PageHeader,Section,Status} from "@/components/UI";
import {StaticDemoQueryTabsController} from "@/components/StaticDemoQueryTabsController";
import {modelLabel,pct,rub} from "@/lib/ui/format";
import {ClientContactEditButton,ClientEditButton} from "@/components/ClientEntityEditor";
import {listTenders} from "@/lib/tenders/service";
import {tenderEnumLabel,tenderResultLabels,tenderStageLabel} from "@/lib/tenders/model";
import {formatTenderDateTime} from "@/lib/tenders/datetime";

const labels:Record<string,string>={
  overview:"Обзор",
  contacts:"Контакты",
  requests:"Заявки",
  tenders:"Тендеры",
  calculations:"Расчёты",
  proposals:"КП",
  objects:"Объекты",
  finance:"Финансы",
};
const statusLabels:Record<string,string>={
  active:"Активен",inactive:"Неактивен",archived:"Архив",blocked:"Заблокирован",
  draft:"Черновик",review:"На проверке",pending:"На согласовании",accepted:"Принято",
  sent:"Отправлено",approved:"Согласовано",rejected:"Отклонено",client_rejected:"Клиент отказался",
  launched:"Передано в запуск",completed:"Завершено",closed:"Закрыто",
};
function statusLabel(value:string){return statusLabels[value]??(/[A-Za-z_]/.test(value)?"Другой статус":value)}
function tone(value:string){
  if(["active","accepted","approved","launched","completed"].includes(value))return"good" as const;
  if(["rejected","client_rejected","blocked"].includes(value))return"bad" as const;
  if(["draft","review","pending","inactive"].includes(value))return"warn" as const;
  return"neutral" as const;
}
function contactPrimary(item:{preferredChannel?:string|null;phone?:string|null;email?:string|null;telegram?:string|null;whatsapp?:string|null;maxContact?:string|null}){
  if(item.preferredChannel==="telegram"&&item.telegram)return"Telegram: "+item.telegram;
  if(item.preferredChannel==="whatsapp"&&item.whatsapp)return"WhatsApp: "+item.whatsapp;
  if(item.preferredChannel==="max"&&item.maxContact)return"MAX: "+item.maxContact;
  if(item.preferredChannel==="email"&&item.email)return item.email;
  return item.phone??item.telegram??item.whatsapp??item.email??item.maxContact??"—";
}
function contactSecondary(item:{phone?:string|null;email?:string|null;telegram?:string|null;whatsapp?:string|null;maxContact?:string|null}){
  return [item.phone,item.telegram,item.whatsapp,item.email,item.maxContact].filter(Boolean).slice(0,3).join(" · ");
}
const contactRoleLabels:Record<string,string>={
  operations:"Операционные вопросы",timesheet:"Табель",security:"СБ / пропуска",warehouse_ppe:"Склад / СИЗ",documents:"Документы",
  finance:"Финансы",approval:"Согласования",contract_signer:"Подписание договора",closing_signer:"Подписание закрывающих",other:"Другое",
};

export default async function ClientPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
  const {id}=await params;
  const staticDemo=isGithubPagesDemo();
  const {tab:rawTab}=staticDemo?{}:await searchParams;
  const actor=await requireActor();
  const canReadRequests=hasCapability(actor.access,"sales.request.read");
  const canReadTenders=hasCapability(actor.access,"sales.tender.read");
  const canReadObjects=hasCapability(actor.access,"operations.object.read");
  const canReadCalculations=hasCapability(actor.access,"calculation.scenario.read");
  const canReadFinance=hasCapability(actor.access,"finance.pnl.read");
  const canReadProposals=hasCapability(actor.access,"sales.proposal.read")&&canReadRequests;
  const clients=await listClients(actor);
  const client=clients.find(item=>item.id===id);
  if(!client)notFound();
  const canEdit=!actor.demo&&canReadRow(actor.access,"sales.client.edit",client,actor);
  const clientEditOptions=canEdit?await getClientEditOptions(actor):null;

  const [requests,objects,calculations,finance,contacts,proposals,tenders]=await Promise.all([
    canReadRequests?listRequests(actor):Promise.resolve([]),
    canReadObjects?listObjects(actor):Promise.resolve([]),
    canReadCalculations?listCalculations(actor):Promise.resolve([]),
    canReadFinance?listFinance(actor):Promise.resolve([]),
    listClientContacts(actor,id),
    canReadProposals?listProposals(actor):Promise.resolve([]),
    canReadTenders?listTenders(actor):Promise.resolve([]),
  ]);

  const clientRequests=requests.filter(item=>item.clientId===id);
  const clientTenders=tenders.filter(item=>item.clientId===id);
  const requestIds=new Set(clientRequests.map(item=>item.id));
  const clientObjects=objects.filter(item=>item.clientId===id);
  const clientCalculations=calculations.filter(item=>requestIds.has(item.requestId));
  const clientProposals=proposals.filter(item=>requestIds.has(item.requestId));
  const clientFinance=finance.filter(item=>clientObjects.some(object=>object.id===item.objectId));
  const revenue=clientFinance.reduce((sum,item)=>sum+Number(item.revenue),0);
  const contribution=clientFinance.reduce((sum,item)=>sum+Number(item.contribution),0);
  const activeObjects=clientObjects.filter(item=>item.status==="active").length;
  const acceptedCalculations=clientCalculations.filter(item=>item.status==="accepted").length;
  const latestRequest=clientRequests[0]??null;

  const visibleTabKeys=Object.keys(labels).filter(key=>{
    if(key==="requests")return canReadRequests;
    if(key==="tenders")return canReadTenders;
    if(key==="calculations")return canReadCalculations;
    if(key==="proposals")return canReadProposals;
    if(key==="objects")return canReadObjects;
    if(key==="finance")return canReadFinance;
    return true;
  });
  const tab=rawTab&&visibleTabKeys.includes(rawTab)?rawTab:"overview";
  const tabs=visibleTabKeys.map(key=>({
    label:labels[key],href:"/clients/"+id+"?tab="+key,
    count:key==="contacts"?contacts.length:key==="requests"?clientRequests.length:key==="tenders"?clientTenders.length:key==="calculations"?clientCalculations.length:key==="proposals"?clientProposals.length:key==="objects"?clientObjects.length:undefined,
  }));
  const panel=(key:string,content:ReactNode)=>{
    if(!visibleTabKeys.includes(key)||(!staticDemo&&tab!==key))return null;
    return <div data-demo-tab-panel={key} style={{display:staticDemo&&key!=="overview"?"none":"contents"}}>{content}</div>;
  };

  const workspace=<div className="client-entity-workspace">
    <PageHeader title={client.name} subtitle={client.legalName??"Юридическое наименование не указано"} breadcrumbs={[{label:"Коммерция"},{label:"Клиенты",href:"/clients"},{label:client.name}]} actions={canEdit&&clientEditOptions?<ClientEditButton client={client} options={clientEditOptions}/>:undefined}/>
    <EntityTabs items={tabs} active={labels[tab]}/>

    {panel("overview",<div className="request-entity-tab-content request-entity-overview client-entity-overview">
      <main className="request-entity-main">
        <Section title="Коммерческий контур" note="Текущие связи клиента с продажами и запуском">
          <div className="client-overview-facts">
            {canReadRequests&&<Link href={"/clients/"+id+"?tab=requests"}><span>Заявки</span><strong>{clientRequests.length}</strong><small>{latestRequest?.title??"Заявок пока нет"}</small></Link>}
            {canReadCalculations&&<Link href={"/clients/"+id+"?tab=calculations"}><span>Расчёты</span><strong>{clientCalculations.length}</strong><small>{acceptedCalculations} принятых сценариев</small></Link>}
            {canReadProposals&&<Link href={"/clients/"+id+"?tab=proposals"}><span>Коммерческие предложения</span><strong>{clientProposals.length}</strong><small>{clientProposals.length?"Связаны с заявками клиента":"КП пока нет"}</small></Link>}
            {canReadObjects&&<Link href={"/clients/"+id+"?tab=objects"}><span>Объекты</span><strong>{activeObjects} / {clientObjects.length}</strong><small>активные / всего</small></Link>}
          </div>
        </Section>

        {canReadObjects&&<Section title="Операционный портфель" note={activeObjects+" действующих объектов"}>
          <div className="stack-list request-entity-stack">{clientObjects.length?clientObjects.map(item=><Link className="stack-item" href={"/objects/"+item.id} key={item.id}><div><strong>{item.name}</strong><small>{item.region} · укомплектованность {item.coverage}%</small></div><Status tone={item.risk==="critical"?"bad":item.risk==="high"?"warn":tone(item.status)}>{statusLabel(item.status)}</Status></Link>):<Empty title="Объектов пока нет" text="Объекты появятся после передачи согласованного заказа в запуск."/>}</div>
        </Section>}

        <Section title="Ключевые контакты" note={contacts.length+" контактов"} actions={canEdit?<ClientContactEditButton clientId={id}/>:undefined}>
          {contacts.length?<div className="client-contact-summary">{contacts.slice(0,4).map(item=><div key={item.id}><div><strong>{item.fullName}</strong><small>{item.position??"Должность не указана"}</small></div><span>{contactPrimary(item)}</span></div>)}</div>:<Empty title="Контактов пока нет" text="Добавьте контакт клиента, когда появится подтверждённое контактное лицо."/>}
        </Section>
        {client.notes&&<Section title="Комментарий"><p className="client-overview-note">{client.notes}</p></Section>}
      </main>

      <aside className="request-entity-side">
        <Section title="Карточка клиента">
          <div className="request-entity-side-body">
            <KeyValue label="Статус" value={<Status tone={tone(client.status)}>{statusLabel(client.status)}</Status>}/>
            <KeyValue label="Юр. наименование" value={client.legalName??"—"}/>
            <KeyValue label="ИНН" value={client.inn??"—"}/>
            <KeyValue label="Ответственный" value={client.ownerName??"Не назначен"}/>
            <KeyValue label="Регион" value={client.region??"Не указан"}/>
            <KeyValue label="Команда" value={client.teamName??"Не назначена"}/>
          </div>
        </Section>
        <Section title="Основной контакт">
          <div className="request-entity-side-body">
            <KeyValue label="Контакт" value={client.primaryContactName??"—"}/>
            <KeyValue label="Телефон" value={client.primaryContactPhone??"—"}/>
            <KeyValue label="Эл. почта" value={client.primaryContactEmail??"—"}/>
            <KeyValue label="Всего контактов" value={<Link href={"/clients/"+id+"?tab=contacts"}>{contacts.length}</Link>}/>
          </div>
        </Section>
        {canReadFinance&&<Section title="Финансовый итог"><div className="request-entity-side-body"><KeyValue label="Выручка" value={rub(revenue)} sensitive/><KeyValue label="Вклад в прибыль" value={rub(contribution)} sensitive/><KeyValue label="Маржа" value={revenue?pct(contribution/revenue*100):"—"} sensitive/></div></Section>}
      </aside>
    </div>)}

    {panel("contacts",<div className="request-entity-tab-content"><Section title="Контакты клиента" note={contacts.length+" контактов"} actions={canEdit?<ClientContactEditButton clientId={id}/>:undefined}>
      {contacts.length?<div className="request-table-wrap"><table className="data-table request-registry-table client-entity-table client-contact-table"><thead><tr><th>Контакт</th><th>Связь</th><th>Объекты / роль</th>{canEdit&&<th aria-label="Действия"/>}</tr></thead><tbody>{contacts.map(item=><tr key={item.id}><td><strong className="cell-title">{item.fullName}</strong><span className="cell-sub">{item.position??"Должность не указана"}</span></td><td><strong>{contactPrimary(item)}</strong><span className="cell-sub">{contactSecondary(item)}</span></td><td>{item.objectAssignments.length?item.objectAssignments.map(link=><div key={link.objectId}><Link href={"/objects/"+link.objectId+"?tab=contacts"}>{link.object}</Link><span className="cell-sub">{link.roles.map(role=>contactRoleLabels[role]??role).join(" · ")}</span></div>):"Не привязан к объектам"}</td>{canEdit&&<td className="client-contact-action-cell"><ClientContactEditButton clientId={id} contact={item}/></td>}</tr>)}</tbody></table></div>:<Empty title="Контактов пока нет" text="Контакты можно добавить из этой вкладки или при создании клиента."/>}
    </Section></div>)}

    {panel("requests",<div className="request-entity-tab-content"><Section title="Заявки клиента" note={clientRequests.length+" заявок"}>
      <div className="request-table-wrap"><table className="data-table request-registry-table client-entity-table"><thead><tr><th>Заявка</th><th>Позиции</th><th>Старт</th><th>Статус</th></tr></thead><tbody>{clientRequests.length?clientRequests.map(item=><tr key={item.id}><td><Link className="cell-title" href={"/requests/"+item.id}>{item.title}</Link><span className="cell-sub">{item.location||"Локация уточняется"}</span></td><td>{item.roles.map(role=>role.name+" × "+role.count).join(" · ")||"—"}</td><td>{item.start||"—"}</td><td><Status tone={tone(item.status)}>{statusLabel(item.status)}</Status></td></tr>):<tr><td colSpan={4}><div className="empty-inline">Заявок пока нет</div></td></tr>}</tbody></table></div>
    </Section></div>)}

    {panel("tenders",<div className="request-entity-tab-content"><Section title="Тендеры клиента" note={clientTenders.length+" тендеров"}>
      <div className="request-table-wrap"><table className="data-table request-registry-table client-entity-table"><thead><tr><th>Тендер</th><th>Площадка</th><th>Срок подачи</th><th>Этап</th><th>Результат</th></tr></thead><tbody>{clientTenders.length?clientTenders.map(item=><tr key={item.id}><td><Link className="cell-title" href={"/tenders/"+item.id}>{item.title}</Link><span className="cell-sub">{item.procedureNumber?"№ "+item.procedureNumber:"Номер не указан"}</span></td><td>{item.platform??"—"}</td><td>{item.submissionDeadline?formatTenderDateTime(item.submissionDeadline):"—"}</td><td><Status tone={tone(item.stage)}>{tenderStageLabel(item.stage)}</Status></td><td>{item.result?tenderEnumLabel(tenderResultLabels,item.result):"—"}</td></tr>):<tr><td colSpan={5}><div className="empty-inline">Связанных тендеров пока нет</div></td></tr>}</tbody></table></div>
    </Section></div>)}

    {panel("calculations",<div className="request-entity-tab-content"><Section title="Расчёты" note={clientCalculations.length+" сценариев"}>
      <div className="request-table-wrap"><table className="data-table request-registry-table client-entity-table"><thead><tr><th>Сценарий</th><th>Роль</th><th>Модель</th><th>Ставка клиенту</th><th>Маржа</th><th>Статус</th></tr></thead><tbody>{clientCalculations.length?clientCalculations.map(item=><tr key={item.id}><td><Link className="cell-title" href={"/calculations?request="+item.requestId+"#scenario-"+item.id}>{item.name}</Link></td><td>{item.role}</td><td>{modelLabel(item.model)}</td><td className="num">{rub(item.clientRate)}</td><td className="num">{pct(item.marginPct)}</td><td><Status tone={tone(item.status)}>{statusLabel(item.status)}</Status></td></tr>):<tr><td colSpan={6}><div className="empty-inline">Расчётов пока нет</div></td></tr>}</tbody></table></div>
    </Section></div>)}

    {canReadProposals&&panel("proposals",<div className="request-entity-tab-content"><Section title="Коммерческие предложения" note={clientProposals.length+" документов"}>
      <div className="request-table-wrap"><table className="data-table request-registry-table client-entity-table"><thead><tr><th>КП</th><th>Заявка</th><th>Стоимость</th><th>Статус</th><th>Создано</th></tr></thead><tbody>{clientProposals.length?clientProposals.map(item=><tr key={item.id}><td><Link className="cell-title" href={"/proposals/"+item.id}>КП №{item.version}</Link><span className="cell-sub">{item.scenarioCount} сценариев</span></td><td><Link href={"/requests/"+item.requestId}>{item.request}</Link></td><td className="num">{rub(item.totalValue)}</td><td><Status tone={tone(item.status)}>{statusLabel(item.status)}</Status></td><td><span>{item.createdAt}</span><span className="cell-sub">{item.createdBy}</span></td></tr>):<tr><td colSpan={5}><div className="empty-inline">Коммерческих предложений пока нет</div></td></tr>}</tbody></table></div>
    </Section></div>)}

    {panel("objects",<div className="request-entity-tab-content"><Section title="Объекты" note={clientObjects.length+" объектов"}>
      <div className="stack-list request-entity-stack">{clientObjects.length?clientObjects.map(item=><Link className="stack-item" href={"/objects/"+item.id} key={item.id}><div><strong>{item.name}</strong><small>{item.region} · {item.code}</small></div><Status tone={item.risk==="critical"?"bad":item.risk==="high"?"warn":tone(item.status)}>{statusLabel(item.status)}</Status></Link>):<Empty title="Объектов пока нет" text="Связанные объекты появятся после запуска согласованного заказа."/>}</div>
    </Section></div>)}

    {canReadFinance&&panel("finance",<div className="request-entity-tab-content"><Section title="Финансы клиента" note="Доступно только ролям с финансовым доступом"><div className="client-finance-summary"><div><span>Выручка</span><strong>{rub(revenue)}</strong></div><div><span>Вклад в прибыль</span><strong>{rub(contribution)}</strong></div><div><span>Маржа</span><strong>{revenue?pct(contribution/revenue*100):"—"}</strong></div></div></Section></div>)}
  </div>;

  return staticDemo?<StaticDemoQueryTabsController enabled defaultTab="overview">{workspace}</StaticDemoQueryTabsController>:workspace;
}
