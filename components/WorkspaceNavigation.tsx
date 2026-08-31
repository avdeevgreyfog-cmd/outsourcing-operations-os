"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Actor } from "@/lib/access/types";
import { DemoRoleSwitch } from "@/components/DemoRoleSwitch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Activity, BriefcaseBusiness, ChartNoAxesCombined, ChevronDown, Factory, Home, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldCheck, Users, WalletCards, X } from "lucide-react";

export type NavigationItem = { label: string; href: string; capability?: string; keywords?: string };
export type NavigationGroup = { id: string; label: string; items: NavigationItem[] };
export type NavigationSection = { id: string; label: string; icon: string; groups: NavigationGroup[] };
const icons = { home: Home, briefcase: BriefcaseBusiness, factory: Factory, users: Users, wallet: WalletCards, chart: ChartNoAxesCombined, shield: ShieldCheck, settings: Settings };
const routePath = (href: string) => href.split("?")[0];
function sameRoute(pathname: string, href: string) { const path = routePath(href); return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`); }

export function WorkspaceNavigation({ actor, sections }: { actor: Actor; sections: NavigationSection[] }) {
  const pathname = usePathname(); const router = useRouter();
  const activeSection = sections.find((section) => section.groups.some((group) => group.items.some((item) => sameRoute(pathname, item.href))))?.id ?? sections[0]?.id;
  const activeGroup = sections.flatMap((section) => section.groups).find((group) => group.items.some((item) => sameRoute(pathname, item.href)))?.id;
  const [openSections, setOpenSections] = useState<string[]>(activeSection ? [activeSection] : []); const [openGroups, setOpenGroups] = useState<string[]>(activeGroup ? [activeGroup] : []); const [compact, setCompact] = useState(false); const [palette, setPalette] = useState(false); const [query, setQuery] = useState("");
  useEffect(() => { const timer=window.setTimeout(()=>{const saved=window.localStorage.getItem("operis.navigation");if(!saved)return;try{const value=JSON.parse(saved) as {sections?:string[];groups?:string[];compact?:boolean};if(value.sections)setOpenSections(value.sections);if(value.groups)setOpenGroups(value.groups);if(typeof value.compact==="boolean")setCompact(value.compact)}catch{}},0);return()=>window.clearTimeout(timer)}, []);
  useEffect(() => { window.localStorage.setItem("operis.navigation", JSON.stringify({ sections: openSections, groups: openGroups, compact })); }, [openSections, openGroups, compact]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette(true); } if (event.key === "Escape") setPalette(false); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  const items = useMemo(() => sections.flatMap((section) => section.groups.flatMap((group) => group.items.map((item) => ({ ...item, section: section.label, group: group.label })))), [sections]);
  const results = items.filter((item) => `${item.label} ${item.section} ${item.group} ${item.keywords ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
  const toggleSection = (id: string) => setOpenSections((current) => current.includes(id) ? current.filter((x) => x !== id) : [id]);
  const toggleGroup = (id: string) => setOpenGroups((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const open = (item: NavigationItem) => { setPalette(false); setQuery(""); router.push(item.href); };
  return <>
    <aside className={`sidebar ${compact ? "sidebar-compact" : ""}`}>
      <div className="brand"><span className="brand-mark">O</span>{!compact && <div><strong>OPERIS</strong><small>Outsourcing OS</small></div>}</div>
      <button className="nav-search" type="button" onClick={() => setPalette(true)} title="Быстрый переход (Ctrl+K)"><Search size={16}/>{!compact && <><span>Быстрый переход</span><kbd>Ctrl K</kbd></>}</button>
      <nav className="nav-groups" aria-label="Основная навигация">{sections.map((section) => { const Icon = icons[section.icon as keyof typeof icons] ?? Activity; const expanded = openSections.includes(section.id); return <div className="nav-section" key={section.id}>
        <button type="button" className={`nav-section-button ${activeSection === section.id ? "is-current" : ""}`} onClick={() => compact ? setCompact(false) : toggleSection(section.id)} title={section.label} aria-expanded={expanded}><Icon size={17}/>{!compact && <><span>{section.label}</span><ChevronDown size={14} className={expanded ? "rotated" : ""}/></>}</button>
        {!compact && expanded && <div className="nav-section-body">{section.groups.map((group) => { const groupOpen = openGroups.includes(group.id); return <div className="nav-subgroup" key={group.id}><button type="button" onClick={() => toggleGroup(group.id)} aria-expanded={groupOpen}><span>{group.label}</span><ChevronDown size={13} className={groupOpen ? "rotated" : ""}/></button>{groupOpen && <div>{group.items.map((item) => <Link key={item.href} href={item.href} className={sameRoute(pathname, item.href) ? "active" : ""}>{item.label}</Link>)}</div>}</div>})}</div>}
      </div>})}</nav>
      <div className="sidebar-foot"><div className="avatar">{actor.displayName.split(" ").map((x) => x[0]).join("").slice(0,2)}</div>{!compact && <div className="who"><strong>{actor.displayName}</strong><span>{actor.roleName}</span></div>}<button type="button" className="sidebar-collapse" onClick={() => setCompact((x) => !x)} title={compact ? "Развернуть меню" : "Свернуть меню"}>{compact ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}</button></div>
    </aside>
    <header className={`topbar ${compact ? "topbar-compact" : ""}`}><button className="mobile-menu" type="button" onClick={() => setCompact((x) => !x)} aria-label="Меню"><Menu size={18}/></button><div className="topbar-context"><span className="live-dot"/> Рабочий контур · {actor.roleName}</div><div className="topbar-actions">{actor.demo && <DemoRoleSwitch current={actor.roleCode === "object_manager" ? "object" : actor.roleCode === "sales_manager" ? "sales" : actor.roleCode === "regional_manager" ? "regional" : actor.roleCode}/>}<ThemeToggle/><Link className="icon-button" href="/tasks" aria-label="Задачи"><Activity size={16}/></Link></div></header>
    {palette && <div className="command-overlay" role="presentation" onMouseDown={() => setPalette(false)}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Быстрый переход" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search size={18}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Клиент, объект, сотрудник или раздел" aria-label="Поиск"/><button type="button" onClick={() => setPalette(false)} aria-label="Закрыть"><X size={17}/></button></div><div className="command-results">{results.length ? results.map((item) => <button type="button" key={item.href} onClick={() => open(item)}><span><strong>{item.label}</strong><small>{item.section} · {item.group}</small></span><kbd>↵</kbd></button>) : <div className="command-empty">Ничего не найдено. Проверьте название или откройте нужный раздел через меню.</div>}</div></section></div>}
  </>;
}
