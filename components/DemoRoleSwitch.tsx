"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const roles = [
  ["director", "Директор"], ["sales", "Продажи"], ["regional", "Региональный менеджер"], ["object", "Менеджер объекта"],
  ["recruiter", "Рекрутер"], ["economist", "Экономист"], ["finance", "Финансист"],
] as const;

export function DemoRoleSwitch({ current }: { current: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  function change(code: string) {
    setBusy(true);
    document.cookie = `oo_demo_role=${encodeURIComponent(code)}; Path=/; Max-Age=2592000; SameSite=Lax`;
    router.push("/");
    router.refresh();
    setBusy(false);
  }
  return (
    <label className="demo-role">
      <span>Роль</span>
      <select disabled={busy} value={current} onChange={(e) => change(e.target.value)}>
        {roles.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
  );
}
