"use client";
import {Moon,Sun} from "lucide-react";
export function ThemeToggle(){function toggle(){const root=document.documentElement;const next=root.dataset.theme!=="dark";root.dataset.theme=next?"dark":"light";document.cookie=`oo_theme=${next?"dark":"light"}; path=/; max-age=31536000; samesite=lax`}return <button className="icon-button theme-toggle" type="button" onClick={toggle} aria-label="Переключить тему"><Moon className="theme-light-icon" size={16}/><Sun className="theme-dark-icon" size={16}/></button>}
