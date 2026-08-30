"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    document.cookie = `oo_theme=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  }
  return <button className="icon-button" type="button" onClick={toggle} aria-label="Переключить тему">{dark ? "☀" : "◐"}</button>;
}
