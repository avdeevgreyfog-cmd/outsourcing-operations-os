"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus } from "lucide-react";

export function CalculationVersionButton({ calculationId, disabled = false }: { calculationId: string; disabled?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{busy:boolean;error:string}>({busy:false,error:""});

  async function createVersion() {
    if (state.busy || disabled) return;
    setState({busy:true,error:""});
    const response = await fetch(`/api/calculations/${calculationId}/clone`, { method: "POST" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState({busy:false,error:json.error ?? "Не удалось создать новую версию расчёта"});
      return;
    }
    router.push(`/calculations/${json.id}`);
    router.refresh();
  }

  return <div className="calculation-version-action">
    <button type="button" className="button" disabled={disabled || state.busy} onClick={createVersion}>
      <CopyPlus size={15}/>{state.busy ? "Создание версии…" : "Создать новую версию"}
    </button>
    {state.error && <span className="form-error" role="alert">{state.error}</span>}
  </div>;
}
