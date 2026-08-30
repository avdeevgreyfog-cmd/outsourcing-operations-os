"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const roles = [
  ["director", "Director"], ["sales", "Sales"], ["regional", "Regional"], ["object", "Object Manager"],
  ["recruiter", "Recruiter"], ["economist", "Economist"], ["finance", "Finance"],
] as const;

export function DemoRoleSwitch({ current }: { current: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(code: string) {
    setBusy(true);
    await fetch("/api/demo-session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: code }) });
    router.push("/");
    router.refresh();
    setBusy(false);
  }
  return (
    <label className="demo-role">
      <span>Preview as</span>
      <select disabled={busy} value={current} onChange={(e) => change(e.target.value)}>
        {roles.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
  );
}
