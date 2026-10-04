"use client";

export function RegistryGroupingControls<Id extends string>({ options, group, subgroup, none, onChange, onExpand }: {
  options: readonly { id: Id; label: string }[]; group: Id; subgroup: Id; none: Id;
  onChange: (value: { group: Id; subgroup: Id }) => void; onExpand?: () => void;
}) {
  return <div className="registry-grouping-controls">
    <p>До двух уровней. Группы сворачиваются стрелкой.</p>
    <div className="registry-grouping-levels">
      <label>Первый уровень<select value={group} onChange={event => { const next = event.target.value as Id; onChange({ group: next, subgroup: next === none || next === subgroup ? none : subgroup }); }}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label>Второй уровень<select value={subgroup} disabled={group === none} onChange={event => onChange({ group, subgroup: event.target.value as Id })}>{options.filter(option => option.id === none || option.id !== group).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    </div>
    {onExpand && <button type="button" className="button" onClick={onExpand}>Развернуть все группы</button>}
  </div>;
}
