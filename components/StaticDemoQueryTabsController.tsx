"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  enabled: boolean;
  defaultTab: string;
  className?: string;
  children: ReactNode;
};

export function StaticDemoQueryTabsController({ enabled, defaultTab, className, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-demo-tab-panel]"));
    const available = new Set(
      panels
        .map((panel) => panel.dataset.demoTabPanel)
        .filter((value): value is string => Boolean(value)),
    );

    const apply = () => {
      const url = new URL(window.location.href);
      const requested = url.searchParams.get("tab");
      const active = requested && available.has(requested) ? requested : defaultTab;

      for (const panel of panels) {
        panel.style.display = panel.dataset.demoTabPanel === active ? "contents" : "none";
      }

      const nav = root.querySelector<HTMLElement>("nav.entity-tabs");
      if (nav) {
        for (const link of nav.querySelectorAll<HTMLAnchorElement>("a[href]")) {
          const target = new URL(link.href, window.location.href);
          const key = target.searchParams.get("tab");
          link.classList.toggle("active", key === active);
          if (key === active) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        }
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || !root.contains(link)) return;

      const url = new URL(link.href, window.location.href);
      const key = url.searchParams.get("tab");
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        !key ||
        !available.has(key)
      ) return;

      event.preventDefault();
      event.stopPropagation();
      window.history.pushState({}, "", url.pathname + url.search + url.hash);
      apply();
    };

    root.addEventListener("click", onClick, true);
    window.addEventListener("popstate", apply);
    apply();

    return () => {
      root.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", apply);
    };
  }, [defaultTab, enabled]);

  return <div ref={rootRef} className={className}>{children}</div>;
}
