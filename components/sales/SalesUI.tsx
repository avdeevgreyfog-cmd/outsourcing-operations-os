"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Search, X, SearchX } from "lucide-react";

export function SalesMetrics({ label, items }: { label: string; items: { label: string; value: ReactNode; note: string }[] }) {
  return <div className="sales-metrics" aria-label={label}>{items.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>)}</div>;
}

export function SalesSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="sales-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)}/>{value && <button type="button" aria-label="Очистить поиск" onClick={() => onChange("")}><X size={15}/></button>}</div>;
}

export function SalesSegments<T extends string>({ label, value, items, onChange }: { label: string; value: T; items: { value: T; label: string; icon?: ReactNode }[]; onChange: (value: T) => void }) {
  return <div className="sales-segments" role="group" aria-label={label}>{items.map(item => <button type="button" key={item.value} aria-pressed={value === item.value} onClick={() => onChange(item.value)}>{item.icon}{item.label}</button>)}</div>;
}

export function SalesEmpty({ title = "Ничего не найдено", text = "Попробуйте другой запрос или сбросьте фильтры.", onReset }: { title?: string; text?: string; onReset?: () => void }) {
  return <div className="sales-empty"><SearchX size={24} aria-hidden="true"/><strong>{title}</strong><p>{text}</p>{onReset && <button className="button" onClick={onReset}>Сбросить фильтры</button>}</div>;
}

// Native modal supplies focus containment, Escape, inert background and focus return.
export function SalesDrawer({ title, subtitle, children, footer, onClose }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="sales-drawer" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <div className="sales-drawer-content"><header><div><span className="sales-overline">Быстрый просмотр</span><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button autoFocus type="button" className="icon-button" onClick={onClose} aria-label="Закрыть просмотр"><X size={18}/></button></header><div className="sales-drawer-body">{children}</div>{footer && <footer>{footer}</footer>}</div>
  </dialog>;
}
