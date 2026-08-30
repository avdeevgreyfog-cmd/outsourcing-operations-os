"use client";

export function ThemeToggle() {
  function toggle() {
    const root=document.documentElement;
    const next=root.dataset.theme!=="dark";
    root.dataset.theme=next?"dark":"light";
    document.cookie=`oo_theme=${next?"dark":"light"}; path=/; max-age=31536000; samesite=lax`;
  }
  return <button className="icon-button" type="button" onClick={toggle} aria-label="Переключить тему">◐</button>;
}
