"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pin } from "lucide-react";
import { registryWidth, type RegistryColumn, type RegistryColumnLayout } from "@/lib/ui/registry-layout";

function ColumnWidthInput({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (width: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input aria-label={`Ширина: ${label}`} type="number" min={110} max={480} step={10} value={draft ?? value} disabled={disabled} onChange={event => setDraft(event.target.value)} onBlur={() => { if (draft !== null && draft.trim() && Number.isFinite(Number(draft))) onCommit(registryWidth(Number(draft))); setDraft(null); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.preventDefault(); setDraft(null); } }}/>
}

export function RegistryColumnControls<Id extends string>({ columns, layout, onChange, onReset }: {
  columns: readonly RegistryColumn<Id>[]; layout: RegistryColumnLayout<Id>;
  onChange: (layout: RegistryColumnLayout<Id>) => void; onReset?: () => void;
}) {
  const ordered = [...layout.columns, ...columns.map(column => column.id).filter(id => !layout.columns.includes(id))];
  function move(id: Id, delta: number) {
    const next = [...layout.columns], index = next.indexOf(id), target = index + delta;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...layout, columns: next });
  }
  return <div className="registry-column-controls">
    <p>Выберите колонки, их порядок, ширину и закрепление. Закреплённые колонки располагаются слева.</p>
    <div className="registry-column-list">{ordered.map(id => {
      const column = columns.find(item => item.id === id);
      if (!column) return null;
      const visible = layout.columns.includes(id), index = layout.columns.indexOf(id);
      return <div key={id} className="registry-column-setting">
        <label className="registry-column-name"><input type="checkbox" checked={visible} disabled={column.required} onChange={event => onChange({ ...layout, columns: event.target.checked ? [...layout.columns, id] : layout.columns.filter(item => item !== id), pinned: layout.pinned.filter(item => item !== id) })}/>{column.label}</label>
        <button type="button" className="icon-button" aria-label={`Закрепить: ${column.label}`} aria-pressed={layout.pinned.includes(id)} disabled={!visible} onClick={() => onChange({ ...layout, pinned: layout.pinned.includes(id) ? layout.pinned.filter(item => item !== id) : [...layout.pinned, id] })}><Pin size={14}/></button>
        <label className="registry-column-width"><span>Ширина</span><ColumnWidthInput label={column.label} value={layout.widths[id] ?? column.width} disabled={!visible} onCommit={width => onChange({ ...layout, widths: { ...layout.widths, [id]: width } })}/><span>px</span></label>
        <div className="registry-column-order"><button type="button" className="icon-button" aria-label={`Выше: ${column.label}`} disabled={!visible || index === 0} onClick={() => move(id, -1)}><ArrowUp size={14}/></button><button type="button" className="icon-button" aria-label={`Ниже: ${column.label}`} disabled={!visible || index === layout.columns.length - 1} onClick={() => move(id, 1)}><ArrowDown size={14}/></button></div>
      </div>;
    })}</div>
    {onReset && <button type="button" className="button" onClick={onReset}>Восстановить основные колонки</button>}
  </div>;
}
