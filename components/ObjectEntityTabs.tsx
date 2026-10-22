import Link from "next/link";

type Tab = {label:string;href:string;count?:number};

/** Keep daily work visible while retaining every existing entity route. */
export function ObjectEntityTabs({items,active}:{items:Tab[];active:string}) {
  const primaryLabels = new Set(["Обзор","Запуск","Персонал","Комплектация","Планирование","Табели"]);
  const primary = items.filter(item=>primaryLabels.has(item.label));
  const secondary = items.filter(item=>!primaryLabels.has(item.label));
  const selectedSecondary = secondary.find(item=>item.label===active);
  const link = (item:Tab) => <Link key={item.href} href={item.href} className={item.label===active?"active":""} aria-current={item.label===active?"page":undefined}>{item.label}{item.count!=null&&<span>{item.count}</span>}</Link>;
  return <nav className="entity-tabs object-entity-tabs" aria-label="Разделы карточки">
    {primary.map(link)}
    {selectedSecondary&&link(selectedSecondary)}
    {secondary.length>0&&<details className="object-tabs-more" key={active}>
      <summary>Ещё <span aria-hidden="true">⌄</span></summary>
      <div className="object-tabs-menu">{secondary.map(link)}</div>
    </details>}
  </nav>;
}
