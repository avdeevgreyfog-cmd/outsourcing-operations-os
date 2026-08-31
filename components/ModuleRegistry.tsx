import Link from "next/link";
import { Metric, PageHeader, Section, Status } from "@/components/UI";

export type RegistryItem = {
  id: string; label: string; href: string; capability?: string; sectionLabel: string; groupLabel: string;
  state: "active" | "foundation"; details: { purpose: string } | null;
};

export function ModuleRegistry({ items }: { items: RegistryItem[] }) {
  const active = items.filter((item) => item.state === "active").length;
  const foundation = items.length - active;
  return <>
    <PageHeader eyebrow="Администрирование · Архитектура" title="Модули компании" subtitle="Единый паспорт действующих и базовых функциональных контуров Outsourcing Operations OS." breadcrumbs={[{ label: "Администрирование" }, { label: "Модули компании" }]}/>
    <div className="metrics-grid module-registry-metrics">
      <Metric label="Всего в целевой архитектуре" value={items.length}/>
      <Metric label="Действующие рабочие области" value={active} tone="good"/>
      <Metric label="Базовые контуры" value={foundation} note="Ожидают углубления"/>
    </div>
    <Section title="Паспорт платформы" note="Статус «База» означает, что маршрут, назначение, процесс и связи определены, но бизнес-операции ещё не приняты в эксплуатацию." flush>
      <div className="grid-scroll module-registry-scroll"><table className="data-table"><thead><tr><th>Раздел</th><th>Группа</th><th>Модуль</th><th>Состояние</th><th>Назначение / право</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}>
        <td>{item.sectionLabel}</td><td>{item.groupLabel}</td>
        <td className="cell-title"><Link href={item.href}>{item.label}</Link></td>
        <td><Status tone={item.state === "active" ? "good" : "info"}>{item.state === "active" ? "Действует" : "База"}</Status></td>
        <td><span className="cell-purpose">{item.details?.purpose ?? "Рабочий модуль платформы"}</span><small className="cell-sub">{item.capability ?? "Общий доступ"}</small></td>
      </tr>)}</tbody></table></div>
    </Section>
  </>;
}
