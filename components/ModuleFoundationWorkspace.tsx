import Link from "next/link";
import { Empty, PageHeader, Section, Status, SummaryStrip } from "@/components/UI";

export type FoundationModule = {
  id: string;
  label: string;
  href: string;
  capability?: string;
  sectionLabel: string;
  groupLabel: string;
  purpose: string;
  workflow: string[];
  views: string[];
  fields: string[];
  relations: string[];
  next: string[];
};

export function ModuleFoundationWorkspace({ module }: { module: FoundationModule }) {
  return <>
    <PageHeader
      eyebrow={`${module.sectionLabel} · ${module.groupLabel}`}
      title={module.label}
      subtitle={module.purpose}
      breadcrumbs={[{ label: module.sectionLabel }, { label: module.groupLabel }, { label: module.label }]}
      actions={<Link className="button" href="/admin/modules">Паспорт модулей</Link>}
    />
    <SummaryStrip>
      <span>Состояние <Status tone="info">Базовая версия</Status></span>
      <span>Контур <strong>{module.groupLabel}</strong></span>
      <span>Доступ <strong>{module.capability ?? "Общий"}</strong></span>
    </SummaryStrip>
    <div className="foundation-notice">
      <strong>Границы модуля зафиксированы</strong>
      <span>Рабочая область показывает целевой процесс и модель данных. Операции появятся после проработки сценариев, правил и критериев приёмки — без временных действий и фиктивных данных.</span>
    </div>
    <div className="workspace-grid foundation-layout">
      <div>
        <Section title="Сквозной процесс" note="Базовая последовательность этапов внутри единого ядра данных">
          <ol className="foundation-flow">{module.workflow.map((step, index) => <li key={step}><small>{index + 1}</small><span>{step}</span></li>)}</ol>
        </Section>
        <Section title="Базовый реестр" note={`Предусмотренные представления: ${module.views.join(" · ")}`} flush>
          <div className="grid-scroll"><table className="data-table foundation-table"><thead><tr>{module.fields.map((field) => <th key={field}>{field}</th>)}</tr></thead></table></div>
          <Empty title="Записей пока нет" text="Данные появятся здесь после подключения сущностей и бизнес-операций модуля."/>
        </Section>
      </div>
      <aside>
        <Section title="Связи с ядром" note="Используются существующие сущности, без создания отдельных систем">
          <ul className="foundation-list">{module.relations.map((relation) => <li key={relation}>{relation}</li>)}</ul>
        </Section>
        <Section title="Следующая проработка" note="Функциональные блоки для отдельной итерации">
          <ul className="foundation-checklist">{module.next.map((item) => <li key={item}><span/>{item}</li>)}</ul>
        </Section>
      </aside>
    </div>
  </>;
}
