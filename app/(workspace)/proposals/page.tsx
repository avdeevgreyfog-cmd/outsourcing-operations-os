import Link from "next/link";
import {requireActor} from "@/lib/auth/server";
import {listCommercialProposals} from "@/lib/commercial/service";
import {PageHeader,Section,Status} from "@/components/UI";
import {rub} from "@/lib/ui/format";

function tone(status:string){if(["accepted"].includes(status))return "good" as const;if(["client_rejected","rejected_internal"].includes(status))return "bad" as const;if(["draft","revision_requested"].includes(status))return "neutral" as const;return "warn" as const}

export default async function Proposals(){
  const actor=await requireActor();const rows=await listCommercialProposals(actor);
  return <><PageHeader eyebrow="Продажи" title="Коммерческие предложения" subtitle="Версионируемые клиентские предложения: внутренняя проверка, отправка, переговоры, решение клиента и передача в запуск." breadcrumbs={[{label:"Коммерция"},{label:"Коммерческие предложения"}]}/><Section><div className="grid-scroll"><table className="data-table"><thead><tr><th>Заявка / клиент</th><th>Версия</th><th>Сценарии</th><th>Расчётный объём</th><th>Создано</th><th>Автор</th><th>Статус</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><Link href={`/proposals/${x.id}`} className="cell-title">{x.request}</Link><span className="cell-sub">{x.client}</span></td><td>v{x.version}</td><td className="num">{x.scenarioCount}</td><td className="num">{Number(x.totalValue)?rub(x.totalValue):"—"}</td><td>{x.createdAt}</td><td>{x.createdBy}</td><td><Status tone={tone(x.status)}>{x.status}</Status></td></tr>)}</tbody></table></div></Section></>;
}
