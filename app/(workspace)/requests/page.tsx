import Link from "next/link";
import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {listCommercialRequests} from "@/lib/commercial/requests";
import {getCommercialOptions} from "@/lib/commercial/service";
import {RequestCreateButton} from "@/components/CommercialRequestForms";
import {PageHeader,Section,Status} from "@/components/UI";
import {requestSourceLabel} from "@/lib/ui/format";

function tone(status:string){if(["accepted","launched"].includes(status))return "good" as const;if(["lost","archived"].includes(status))return "bad" as const;if(["draft","calculation","proposal_draft"].includes(status))return "neutral" as const;return "warn" as const}

export default async function Requests(){
  const actor=await requireActor();
  const [rows,options]=await Promise.all([listCommercialRequests(actor),getCommercialOptions(actor)]);
  return <>
    <PageHeader eyebrow="Продажи" title="Заявки" subtitle="Единая коммерческая сущность: условия клиента, расчёты, версии КП, переговоры и передача в запуск." breadcrumbs={[{label:"Коммерция"},{label:"Заявки"}]} actions={hasCapability(actor.access,"sales.request.create")?<RequestCreateButton options={options}/>:undefined}/>
    <Section><div className="grid-scroll"><table className="data-table"><thead><tr><th>Заявка</th><th>Клиент</th><th>Позиции</th><th>Старт</th><th>Источник</th><th>Этап</th></tr></thead><tbody>{rows.map(x=>{const displayStatus=x.archivedAt?"archived":x.status;return <tr key={x.id}><td><Link className="cell-title" href={`/requests/${x.id}`}>{x.title}</Link><span className="cell-sub">{x.location}</span></td><td>{x.client}</td><td>{x.roles.map(r=>`${r.name} × ${r.count}`).join(" · ")}</td><td>{x.start??"—"}</td><td>{requestSourceLabel(x.source)}</td><td><Status tone={tone(displayStatus)}>{displayStatus}</Status>{x.archivedAt&&<span className="cell-sub">Бизнес-этап сохранён: <Status tone={tone(x.status)}>{x.status}</Status></span>}</td></tr>})}</tbody></table></div></Section>
  </>;
}
