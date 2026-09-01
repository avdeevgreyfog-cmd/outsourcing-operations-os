import Link from "next/link";

const items=[
  {href:"/organization/structure",label:"Оргструктура"},
  {href:"/organization/staff",label:"Сотрудники компании"},
  {href:"/organization/positions",label:"Должности и роли"},
  {href:"/organization/departments",label:"Подразделения и регионы"},
];

export function OrganizationTabs({active}:{active:string}){
  return <nav className="entity-tabs organization-tabs" aria-label="Организационное ядро">
    {items.map(item=><Link key={item.href} href={item.href} className={item.href===active?"active":""}>{item.label}</Link>)}
  </nav>;
}
