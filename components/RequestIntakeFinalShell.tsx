"use client";

import { useEffect, useMemo, useRef, type ComponentProps } from "react";
import { RequestIntakeWorkspacePolished } from "@/components/RequestIntakeWorkspacePolished";

type Props = ComponentProps<typeof RequestIntakeWorkspacePolished>;

function formatDate(value: string | null | undefined) {
  if (!value) return "Не указан";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function scheduleLabel(value: string | undefined) {
  if (!value) return "Уточняется";
  if (value === "rotation") return "Вахта";
  if (value === "on_demand") return "По заявке";
  if (value === "custom") return "Другой";
  return value;
}

export function RequestIntakeFinalShell(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const roles = props.request?.roles ?? [];
  const total = useMemo(() => roles.reduce((sum, role) => sum + role.count, 0), [roles]);
  const owner = props.workflowMeta?.owner ?? (props.request ? "Не назначен" : "Вы станете ответственным");
  const initialSchedule = props.intake?.schedule.pattern || String(props.request?.schedule?.pattern ?? "");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const replacements: Array<[string, string]> = [
      ["Клиент в CRM", "Клиент в системе"],
      ["Скачать Excel-шаблон", "Скачать шаблон таблицы"],
      ["Импорт из Excel", "Загрузить из таблицы"],
    ];
    for (const element of root.querySelectorAll("label,button")) {
      for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent) continue;
        let next = node.textContent;
        for (const [from, to] of replacements) next = next.replace(from, to);
        if (next !== node.textContent) node.textContent = next;
      }
    }
  }, []);

  return <div className="request-final-editor-shell" ref={rootRef}>
    <div className="request-final-editor-main">
      <RequestIntakeWorkspacePolished {...props}/>
    </div>
    <aside className="request-final-context" aria-label="Сводка заявки">
      <div className="request-final-context-head">
        <span>Рабочая сводка</span>
        <strong>{props.request ? "Текущие условия" : "Новая заявка"}</strong>
        <p>{props.request ? "Показывает сохранённое состояние заявки. Изменения обновятся после сохранения." : "Заполняйте только известные условия. Редкие параметры можно оставить на уточнение."}</p>
      </div>
      <div className="request-final-context-metrics">
        <div><span>Потребность</span><strong>{props.request ? `${total} чел.` : "После заполнения"}</strong></div>
        <div><span>Позиции</span><strong>{props.request ? roles.length : "Не добавлены"}</strong></div>
        <div><span>Старт</span><strong>{formatDate(props.request?.startDate)}</strong></div>
        <div><span>График</span><strong>{scheduleLabel(initialSchedule)}</strong></div>
      </div>
      <div className="request-final-context-block">
        <span>Ответственный</span>
        <strong>{owner}</strong>
      </div>
      <div className="request-final-context-block">
        <span>Принцип заполнения</span>
        <ul>
          <li>Общие условия задаются один раз.</li>
          <li>Исключения указываются внутри позиции.</li>
          <li>Стоимость обеспечения считается в калькуляторе.</li>
        </ul>
      </div>
      <div className="request-final-context-note">
        <i/>
        <span>Черновик можно сохранить с неполными данными и вернуться к уточнению позже.</span>
      </div>
    </aside>
  </div>;
}
