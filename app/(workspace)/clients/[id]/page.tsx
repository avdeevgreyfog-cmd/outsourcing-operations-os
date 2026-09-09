import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { listCalculations, listClients, listFinance, listObjects, listRequests } from "@/lib/data/service";
import { hasCapability } from "@/lib/core/access.mjs";
import { Empty, EntityTabs, KeyValue, PageHeader, Section, Status, SummaryStrip } from "@/components/UI";
import { modelLabel, pct, rub } from "@/lib/ui/format";

const labels: Record<string, string> = {
  overview: "Обзор",
  contacts: "Контакты",
  requests: "Заявки",
  calculations: "Расчёты",
  proposals: "КП",
  objects: "Объекты",
  documents: "Документы",
  finance: "Финансы",
  activity: "Журнал действий",
};

const statusLabels: Record<string, string> = {
  active: "Активно",
  inactive: "Неактивно",
  archived: "Архив",
  draft: "Черновик",
  pending: "На согласовании",
  accepted: "Принято",
  rejected: "Отклонено",
  launched: "Запущено",
  completed: "Завершено",
  closed: "Закрыто",
};

function statusLabel(value: string) {
  return statusLabels[value] ?? (/[A-Za-z_]/.test(value) ? "Другой статус" : value);
}

function tone(value: string) {
  if (["active", "accepted", "launched", "completed"].includes(value)) return "good" as const;
  if (["rejected"].includes(value)) return "bad" as const;
  if (["draft", "pending"].includes(value)) return "warn" as const;
  return "neutral" as const;
}

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const actor = await requireActor();
  const canReadFinance = hasCapability(actor.access, "finance.pnl.read");
  const clients = await listClients(actor);
  const client = clients.find((item) => item.id === id);
  if (!client) notFound();

  const [requests, objects, calculations, finance] = await Promise.all([
    hasCapability(actor.access, "sales.request.read") ? listRequests(actor) : Promise.resolve([]),
    hasCapability(actor.access, "operations.object.read") ? listObjects(actor) : Promise.resolve([]),
    hasCapability(actor.access, "calculation.scenario.read") ? listCalculations(actor) : Promise.resolve([]),
    canReadFinance ? listFinance(actor) : Promise.resolve([]),
  ]);

  const clientRequests = requests.filter((item) => item.clientId === id);
  const clientObjects = objects.filter((item) => item.clientId === id);
  const clientCalculations = calculations.filter((item) => clientRequests.some((request) => request.id === item.requestId));
  const clientFinance = finance.filter((item) => clientObjects.some((object) => object.id === item.objectId));
  const revenue = clientFinance.reduce((sum, item) => sum + Number(item.revenue), 0);
  const contribution = clientFinance.reduce((sum, item) => sum + Number(item.contribution), 0);
  const visibleTabKeys = Object.keys(labels).filter((key) => key !== "finance" || canReadFinance);
  const tab = rawTab && visibleTabKeys.includes(rawTab) ? rawTab : "overview";
  const latestRequest = clientRequests[0] ?? null;
  const acceptedCalculations = clientCalculations.filter((item) => item.status === "accepted").length;
  const activeObjects = clientObjects.filter((item) => item.status === "active").length;

  const tabs = visibleTabKeys.map((key) => ({
    label: labels[key],
    href: `/clients/${id}?tab=${key}`,
    count:
      key === "requests" ? clientRequests.length
      : key === "objects" ? clientObjects.length
      : key === "calculations" ? clientCalculations.length
      : undefined,
  }));

  return <>
    <PageHeader
      eyebrow="Клиент"
      title={client.name}
      subtitle={client.legalName ?? "Юридическое лицо не указано"}
      breadcrumbs={[{ label: "Коммерция" }, { label: "Клиенты", href: "/clients" }, { label: client.name }]}
    />
    <EntityTabs items={tabs} active={labels[tab]}/>

    {tab === "overview" && <>
      <SummaryStrip>
        <span>Статус <strong>{statusLabel(client.status)}</strong></span>
        <span>Контакты <strong>{client.contacts}</strong></span>
        <span>Заявки <strong>{clientRequests.length}</strong></span>
        <span>Расчёты <strong>{clientCalculations.length}</strong></span>
        <span>Объекты <strong>{clientObjects.length}</strong></span>
        {canReadFinance && <span>Вклад в прибыль <strong>{rub(contribution)}</strong></span>}
      </SummaryStrip>

      <div className="request-entity-tab-content client-entity-overview">
        <div className="request-entity-overview-grid">
          <Section title="Коммерческий контур">
            <div className="request-entity-side-body">
              <KeyValue label="Клиент" value={client.legalName || client.name}/>
              <KeyValue label="Последняя заявка" value={latestRequest ? <Link href={`/requests/${latestRequest.id}`}>{latestRequest.title}</Link> : "—"}/>
              <KeyValue label="Принятые расчёты" value={acceptedCalculations}/>
              <KeyValue label="Заявки клиента" value={<Link href={`/clients/${id}?tab=requests`}>Открыть список →</Link>}/>
              {canReadFinance && <KeyValue label="Вклад в прибыль" value={rub(contribution)} sensitive/>}
            </div>
          </Section>

          <Section title="Операционный портфель" note={`${activeObjects} действующих объектов`}>
            <div className="stack-list request-entity-stack">{clientObjects.length ? clientObjects.map((item) => <Link className="stack-item" href={`/objects/${item.id}`} key={item.id}>
              <div><strong>{item.name}</strong><small>{item.region} · укомплектованность {item.coverage}%</small></div>
              <Status tone={item.risk === "critical" ? "bad" : item.risk === "high" ? "warn" : tone(item.status)}>{statusLabel(item.status)}</Status>
            </Link>) : <Empty title="Нет доступных объектов" text="Связанные с клиентом объекты появятся здесь, когда будут доступны в вашей зоне ответственности."/>}</div>
          </Section>
        </div>
      </div>
    </>}

    {tab === "requests" && <div className="request-entity-tab-content">
      <Section title="Заявки клиента" note={`${clientRequests.length} заявок`}>
        <div className="request-table-wrap"><table className="data-table request-registry-table"><thead><tr><th>Заявка</th><th>Позиции</th><th>Старт</th><th>Статус</th></tr></thead><tbody>{clientRequests.length ? clientRequests.map((item) => <tr key={item.id}>
          <td><Link className="cell-title" href={`/requests/${item.id}`}>{item.title}</Link><span className="cell-sub">{item.location || "Локация уточняется"}</span></td>
          <td>{item.roles.map((role) => `${role.name} × ${role.count}`).join(" · ") || "—"}</td>
          <td>{item.start || "—"}</td>
          <td><Status tone={tone(item.status)}>{statusLabel(item.status)}</Status></td>
        </tr>) : <tr><td colSpan={4}><div className="empty-inline">Заявок пока нет</div></td></tr>}</tbody></table></div>
      </Section>
    </div>}

    {tab === "calculations" && <div className="request-entity-tab-content">
      <Section title="Расчёты" note={`${clientCalculations.length} сценариев`}>
        <div className="request-table-wrap"><table className="data-table request-registry-table"><thead><tr><th>Сценарий</th><th>Роль</th><th>Модель</th><th>Ставка клиенту</th><th>Маржа</th><th>Статус</th></tr></thead><tbody>{clientCalculations.length ? clientCalculations.map((item) => <tr key={item.id}>
          <td><Link className="cell-title" href={`/calculations?request=${item.requestId}#scenario-${item.id}`}>{item.name}</Link></td>
          <td>{item.role}</td><td>{modelLabel(item.model)}</td><td className="num">{rub(item.clientRate)}</td><td className="num">{pct(item.marginPct)}</td><td><Status tone={tone(item.status)}>{statusLabel(item.status)}</Status></td>
        </tr>) : <tr><td colSpan={6}><div className="empty-inline">Расчётов пока нет</div></td></tr>}</tbody></table></div>
      </Section>
    </div>}

    {tab === "objects" && <div className="request-entity-tab-content">
      <Section title="Объекты" note={`${clientObjects.length} объектов`}>
        <div className="stack-list request-entity-stack">{clientObjects.length ? clientObjects.map((item) => <Link className="stack-item" href={`/objects/${item.id}`} key={item.id}>
          <div><strong>{item.name}</strong><small>{item.region} · {item.code}</small></div>
          <Status tone={item.risk === "critical" ? "bad" : item.risk === "high" ? "warn" : tone(item.status)}>{statusLabel(item.status)}</Status>
        </Link>) : <Empty title="Нет доступных объектов" text="Связанные с клиентом объекты появятся здесь, когда будут доступны в вашей зоне ответственности."/>}</div>
      </Section>
    </div>}

    {tab === "finance" && canReadFinance && <div className="request-entity-tab-content">
      <Section title="Финансы клиента">
        <div className="request-entity-side-body" style={{ maxWidth: 620 }}>
          <KeyValue label="Выручка" value={rub(revenue)} sensitive/>
          <KeyValue label="Вклад в прибыль" value={rub(contribution)} sensitive/>
          <KeyValue label="Маржа" value={revenue ? pct(contribution / revenue * 100) : "—"} sensitive/>
        </div>
      </Section>
    </div>}

    {["contacts", "proposals", "documents", "activity"].includes(tab) && <div className="request-entity-tab-content">
      <Section title={labels[tab]}><Empty title="Записей нет" text="В доступном контуре клиента записи этого типа отсутствуют."/></Section>
    </div>}
  </>;
}
