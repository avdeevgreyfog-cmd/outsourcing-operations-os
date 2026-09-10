"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Actor } from "@/lib/access/types";
import { DemoRoleSwitch } from "@/components/DemoRoleSwitch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { roleLabel } from "@/lib/ui/format";
import { Activity, BriefcaseBusiness, Building2, ChartNoAxesCombined, ChevronDown, Factory, Home, Menu, PanelLeftClose, PanelLeftOpen, Pin, Search, Settings, ShieldCheck, Users, WalletCards, X } from "lucide-react";

export type NavigationItem = { id?: string; label: string; href: string; capability?: string; keywords?: string; status?: "foundation" };
export type NavigationGroup = { id: string; label: string; items: NavigationItem[] };
export type NavigationSection = { id: string; label: string; icon: string; groups: NavigationGroup[] };
const icons = { home: Home, briefcase: BriefcaseBusiness, factory: Factory, users: Users, wallet: WalletCards, chart: ChartNoAxesCombined, shield: ShieldCheck, building: Building2, settings: Settings };
function sameRoute(pathname: string, href: string, currentView: string) {
  const path = href.split("?")[0];
  if (!(path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`))) return false;
  return path !== "/analytics" || (new URLSearchParams(href.split("?")[1] ?? "").get("view") ?? "portfolio") === currentView;
}
type Preferences = { sections: Record<string, boolean>; groups: Record<string, boolean>; compact: boolean; pins: string[] };
const booleanMap = (value: unknown): Record<string, boolean> => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "boolean")) : {};

export function WorkspaceNavigation({ actor, sections }: { actor: Actor; sections: NavigationSection[] }) {
  const pathname = usePathname(); const router = useRouter(); const currentView = useSearchParams().get("view") ?? "portfolio";
  const activeSection = sections.find(section => section.groups.some(group => group.items.some(item => sameRoute(pathname, item.href, currentView))))?.id;
  const activeGroup = sections.flatMap(section => section.groups).find(group => group.items.some(item => sameRoute(pathname, item.href, currentView)))?.id;
  const items = useMemo(() => sections.flatMap(section => section.groups.flatMap(group => group.items.map(item => ({ ...item, section: section.label, group: group.label })))), [sections]);
  const defaults: Preferences = { sections: {}, groups: activeGroup ? { [activeGroup]: true } : {}, compact: false, pins: ["/", "/analytics"].filter(href => items.some(item => item.href === href)) };
  const [prefs, setPrefs] = useState(defaults);
  const [loaded, setLoaded] = useState(false);
  const [palette, setPalette] = useState(false); const [mobileOpen, setMobileOpen] = useState(false); const [query, setQuery] = useState("");
  const restoredScroll = useRef(0);
  const navRef = useRef<HTMLElement>(null); const searchRef = useRef<HTMLButtonElement>(null);
  const previousRoute = useRef(`${pathname}?${currentView}`);
  const storageKey = `operis.navigation.v4:${actor.organizationId}:${actor.membershipId}`;
  const compact = prefs.compact;
  // Hydrate before writing: default state must never overwrite a stored preference.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          const value = JSON.parse(saved);
          setPrefs({ sections: booleanMap(value.sections), groups: booleanMap(value.groups), compact: value.compact === true, pins: Array.isArray(value.pins) ? value.pins.filter((href: unknown): href is string => typeof href === "string") : [] });
        }
        restoredScroll.current = Number(window.sessionStorage.getItem(`${storageKey}:scroll`)) || 0;
      } catch { /* Browser preference storage is optional. */ }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  useEffect(() => {
    if (loaded && navRef.current) navRef.current.scrollTop = restoredScroll.current;
  }, [loaded]);
  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch { /* Continue in memory. */ }
  }, [loaded, prefs, storageKey]);
  useEffect(() => {
    const route = `${pathname}?${currentView}`;
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    const timer = window.setTimeout(() => setPrefs(current => ({ ...current, sections: activeSection ? { ...current.sections, [activeSection]: true } : current.sections, groups: activeGroup ? { ...current.groups, [activeGroup]: true } : current.groups })), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, currentView, activeSection, activeGroup]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette(true); }
      if (event.key === "Escape") { setMobileOpen(false); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const results = items.filter(item => `${item.label} ${item.section} ${item.group} ${item.keywords ?? ""}`.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")));
  const pinnedItems = prefs.pins.flatMap(href => items.filter(item => item.href === href));
  const togglePin = (href: string) => setPrefs(current => ({ ...current, pins: current.pins.includes(href) ? current.pins.filter(item => item !== href) : [...current.pins, href] }));
  const currentRole = roleLabel(actor.roleCode, actor.roleName);
  const open = (item: NavigationItem) => { setPalette(false); setMobileOpen(false); setQuery(""); router.push(item.href); };
  const itemRow = (item: NavigationItem, shortcut = false) => {
    const active = sameRoute(pathname, item.href, currentView); const pinned = prefs.pins.includes(item.href);
    return <div className={`nav-item-row ${active ? "is-active" : ""}`} key={item.href}>
      <Link href={item.href} onClick={() => setMobileOpen(false)} className={active ? "active" : ""} aria-current={active && !shortcut ? "page" : undefined}><span>{item.label}</span>{item.status === "foundation" && <small className="nav-foundation-badge">База</small>}</Link>
      <button className={`nav-pin ${pinned ? "is-pinned" : ""}`} type="button" aria-label={`${pinned ? "Открепить" : "Закрепить"}: ${item.label}`} aria-pressed={pinned} title={`${pinned ? "Открепить" : "Закрепить"}: ${item.label}`} onClick={() => togglePin(item.href)}><Pin size={12}/></button>
    </div>;
  };
  return <>
    {mobileOpen && <button className="sales-nav-backdrop" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню"/>}
    <aside className={`sidebar ${compact ? "sidebar-compact" : ""} ${mobileOpen ? "sales-mobile-open" : ""}`}>
      <div className="brand"><span className="brand-mark">O</span>{!compact && <div><strong>OPERIS</strong><small>Операционная система</small></div>}</div>
      <button ref={searchRef} className="nav-search" type="button" onClick={() => setPalette(true)} aria-label="Быстрый переход" title="Быстрый переход (Ctrl+K)"><Search size={16}/>{!compact && <><span>Найти раздел</span><kbd>Ctrl K</kbd></>}</button>
      <nav ref={navRef} className="nav-groups" aria-label="Основная навигация" onScroll={() => { if (loaded) { try { window.sessionStorage.setItem(`${storageKey}:scroll`, String(navRef.current?.scrollTop ?? 0)); } catch {} } }}>
        {!compact && <div className="nav-shortcuts"><div className="nav-shortcuts-heading"><Pin size={12}/><span>Закреплённое</span></div>{pinnedItems.map(item => itemRow(item, true))}{!pinnedItems.length && <p>Закрепите нужные страницы кнопкой рядом с названием.</p>}</div>}
        {sections.map(section => {
          const Icon = icons[section.icon as keyof typeof icons] ?? Activity; const expanded = prefs.sections[section.id] !== false;
          return <div className="nav-section" key={section.id}>
            <button type="button" className={`nav-section-button ${activeSection === section.id ? "is-current" : ""}`} onClick={() => {
              const narrow = window.matchMedia("(max-width: 1050px)").matches;
              if (compact || (narrow && !mobileOpen)) { setPrefs(current => ({ ...current, compact: false, sections: { ...current.sections, [section.id]: true } })); if (narrow) setMobileOpen(true); }
              else setPrefs(current => ({ ...current, sections: { ...current.sections, [section.id]: !expanded } }));
            }} title={section.label} aria-expanded={!compact && expanded} aria-controls={`nav-section-${section.id}`}><Icon size={16}/>{!compact && <><span>{section.label}</span><ChevronDown size={13} className={expanded ? "rotated" : ""}/></>}</button>
            {!compact && expanded && <div className="nav-section-body" id={`nav-section-${section.id}`}>{section.groups.map(group => {
              const groupOpen = prefs.groups[group.id] === true;
              return <div className="nav-subgroup" key={group.id}><button type="button" className={activeGroup === group.id ? "is-current" : ""} onClick={() => setPrefs(current => ({ ...current, groups: { ...current.groups, [group.id]: !groupOpen } }))} aria-expanded={groupOpen} aria-controls={`nav-group-${group.id}`}><span>{group.label}</span><ChevronDown size={13} className={groupOpen ? "rotated" : ""}/></button>{groupOpen && <div id={`nav-group-${group.id}`}>{group.items.map(item => itemRow(item))}</div>}</div>;
            })}</div>}
          </div>;
        })}
      </nav>
      <div className="sidebar-foot"><div className="avatar">{actor.displayName.split(" ").map(x => x[0]).join("").slice(0, 2)}</div>{!compact && <div className="who"><strong>{actor.displayName}</strong><span>{currentRole}</span></div>}<button type="button" className="sidebar-collapse" onClick={() => setPrefs(current => ({ ...current, compact: !current.compact }))} aria-label={compact ? "Развернуть меню" : "Свернуть меню"}>{compact ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}</button></div>
    </aside>
    <header className={`topbar ${compact ? "topbar-compact" : ""}`}><button className="mobile-menu" type="button" onClick={() => { setPrefs(current => ({ ...current, compact: false })); setMobileOpen(v => !v); }} aria-label="Меню" aria-expanded={mobileOpen}><Menu size={18}/></button><div className="topbar-context"><span className="live-dot"/> Рабочий контур · {currentRole}</div><div className="topbar-actions">{actor.demo && <DemoRoleSwitch current={actor.roleCode === "object_manager" ? "object" : actor.roleCode === "sales_manager" ? "sales" : actor.roleCode === "regional_manager" ? "regional" : actor.roleCode}/>}<ThemeToggle/><Link className="icon-button" href="/tasks" aria-label="Задачи"><Activity size={16}/></Link></div></header>
    {palette && <NavigationSearch query={query} setQuery={setQuery} results={results} open={open} close={() => { setPalette(false); setQuery(""); searchRef.current?.focus(); }}/>}
  </>;
}
function NavigationSearch({ query, setQuery, results, open, close }: { query: string; setQuery: (value: string) => void; results: (NavigationItem & { section: string; group: string })[]; open: (item: NavigationItem) => void; close: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current; dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialogRef} className="command-palette nav-search-dialog" aria-label="Быстрый переход" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
    <div className="command-input"><Search size={18}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Название раздела или страницы" aria-label="Найти раздел" onKeyDown={event => { if (event.key === "Enter" && results[0]) { event.preventDefault(); open(results[0]); } if (event.key === "ArrowDown") { event.preventDefault(); dialogRef.current?.querySelector<HTMLButtonElement>(".command-results button")?.focus(); } }}/><button type="button" onClick={close} aria-label="Закрыть поиск"><X size={17}/></button></div>
    <div className="command-results" onKeyDown={event => { if (!["ArrowDown", "ArrowUp"].includes(event.key)) return; event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button")); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); const next = index + (event.key === "ArrowDown" ? 1 : -1); if (next < 0) dialogRef.current?.querySelector("input")?.focus(); else buttons[Math.min(next, buttons.length - 1)]?.focus(); }}>
      {results.length ? results.map(item => <button type="button" key={item.href} onClick={() => open(item)}><span><strong>{item.label}</strong><small>{item.section} · {item.group}</small></span></button>) : <div className="command-empty">Раздел не найден. Попробуйте другое название.</div>}
    </div><footer className="nav-search-help">Поиск по доступным страницам · ↑↓ выбор · Enter открыть · Esc закрыть</footer>
  </dialog>;
}
