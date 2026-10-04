"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  scrollRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
  label?: string;
  revision?: string | number;
};
type Bounds = { left: number; width: number; range: number; bottom: number; visible: boolean };
const HIDDEN: Bounds = { left: 0, width: 0, range: 0, bottom: 10, visible: false };

/** Mirrors an overflowing registry's native scrollbar while its own bottom is off-screen. */
export function HorizontalScrollDock({ scrollRef, disabled = false, label = "Горизонтальная прокрутка таблицы", revision }: Props) {
  const dock = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<Bounds>(HIDDEN);
  useEffect(() => {
    const target = scrollRef.current;
    if (!target) return;
    let frame = 0;
    let cancelled = false;
    const viewport = window.visualViewport;
    const syncFromTarget = () => {
      if (dock.current && Math.abs(dock.current.scrollLeft - target.scrollLeft) > 0.5) dock.current.scrollLeft = target.scrollLeft;
    };
    const measure = () => {
      frame = 0;
      if (cancelled) return;
      const rect = target.getBoundingClientRect();
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportRight = viewportLeft + (viewport?.width ?? document.documentElement.clientWidth);
      const viewportBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      const left = Math.max(viewportLeft, rect.left);
      const right = Math.min(viewportRight, rect.right);
      const range = Math.max(0, target.scrollWidth - target.clientWidth);
      const blockingDialog = Array.from(document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"]')).some(element => element.getClientRects().length > 0);
      const displayed = window.getComputedStyle(target).visibility !== "hidden";
      const visible = displayed && !disabled && !blockingDialog && target.getClientRects().length > 0 && range > 2 && right - left > 30 && rect.top < viewportBottom - 30 && rect.bottom > viewportBottom + 2;
      const next = { left, width: Math.max(0, right - left), range, bottom: Math.max(10, window.innerHeight - viewportBottom + 10), visible };
      setBounds(previous => previous.left === next.left && previous.width === next.width && previous.range === next.range && previous.bottom === next.bottom && previous.visible === next.visible ? previous : next);
      syncFromTarget();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resized = new ResizeObserver(schedule);
    resized.observe(target);
    for (const child of Array.from(target.children)) resized.observe(child);
    const children = new MutationObserver(records => {
      if (records.some(record => record.type === "childList")) {
        resized.disconnect(); resized.observe(target);
        for (const child of Array.from(target.children)) resized.observe(child);
      }
      schedule();
    });
    children.observe(target, { childList: true, subtree: true, attributes: true });
    // Modal drawers can live in a portal, outside the registry subtree.
    const dialogs = new MutationObserver(schedule);
    dialogs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal", "hidden", "class"] });
    target.addEventListener("scroll", syncFromTarget, { passive: true });
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    viewport?.addEventListener("resize", schedule, { passive: true });
    viewport?.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      cancelled = true; cancelAnimationFrame(frame); resized.disconnect(); children.disconnect(); dialogs.disconnect();
      target.removeEventListener("scroll", syncFromTarget);
      document.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule); viewport?.removeEventListener("scroll", schedule);
    };
  }, [scrollRef, disabled, revision]);
  useEffect(() => {
    if (dock.current && scrollRef.current) dock.current.scrollLeft = scrollRef.current.scrollLeft;
  }, [bounds, scrollRef]);
  if (!bounds.visible || disabled) return null;
  return createPortal(<div
    ref={dock}
    className="operis-scroll-dock"
    style={{ left: bounds.left, width: bounds.width, bottom: bounds.bottom }}
    role="region"
    aria-label={label}
    tabIndex={0}
    onScroll={event => {
      const target = scrollRef.current;
      if (target && Math.abs(target.scrollLeft - event.currentTarget.scrollLeft) > 0.5) target.scrollLeft = event.currentTarget.scrollLeft;
    }}
    onKeyDown={event => {
      const target = scrollRef.current;
      if (!target || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const left = event.key === "Home" ? 0 : event.key === "End" ? target.scrollWidth - target.clientWidth : target.scrollLeft + (event.key === "ArrowLeft" ? -80 : 80);
      target.scrollLeft = left;
      event.currentTarget.scrollLeft = target.scrollLeft;
    }}
  ><div className="operis-scroll-dock-track" style={{ width: `calc(100% + ${bounds.range}px)` }}/></div>, document.body);
}
