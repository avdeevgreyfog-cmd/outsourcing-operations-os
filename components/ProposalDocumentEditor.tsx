"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommercialProposalContent } from "@/lib/commercial/proposal-document";

function lines(value: string[] | undefined) { return (value ?? []).join("\n"); }
function splitLines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }

export function ProposalDocumentEditor({ proposalId, content }: { proposalId: string; content: CommercialProposalContent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(event.currentTarget);
    const payload = {
      action: "edit",
      objectName: String(fd.get("objectName") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      validUntil: String(fd.get("validUntil") ?? "").trim() || null,
      schedule: String(fd.get("schedule") ?? "").trim() || null,
      included: splitLines(String(fd.get("included") ?? "")),
      clientProvides: splitLines(String(fd.get("clientProvides") ?? "")),
      terms: String(fd.get("terms") ?? "").trim() || null,
      additionalConditions: String(fd.get("additionalConditions") ?? "").trim() || null,
      comment: String(fd.get("comment") ?? "").trim() || null,
    };

    try {
      const response = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось сохранить КП");
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить КП");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="button" type="button" onClick={() => setOpen(true)}>Редактировать</button>
    {open && <>
      <div className="drawer-backdrop" onClick={() => !busy && setOpen(false)}/>
      <aside className="drawer proposal-editor-drawer" role="dialog" aria-modal="true" aria-label="Редактирование коммерческого предложения">
        <header className="proposal-editor-head">
          <div><span className="eyebrow">Коммерческое предложение</span><h2>Редактирование документа</h2><p>Меняется только клиентская часть. Ставки и позиции берутся из согласованных расчётов.</p></div>
          <button className="icon-button" type="button" onClick={() => !busy && setOpen(false)} aria-label="Закрыть">×</button>
        </header>

        <form className="proposal-editor-form" onSubmit={save}>
          <section>
            <header><strong>Основная информация</strong><span>Название, описание и срок действия</span></header>
            <label>Объект / название предложения<input name="objectName" required defaultValue={content.objectName ?? content.title ?? ""}/></label>
            <label>Описание<textarea name="description" rows={4} defaultValue={content.description ?? ""}/></label>
            <div className="proposal-editor-grid"><label>Срок действия<input type="date" name="validUntil" defaultValue={content.validUntil ?? ""}/></label><label>График / объём<input name="schedule" defaultValue={content.schedule ?? ""}/></label></div>
          </section>

          <section>
            <header><strong>Состав ставки</strong><span>Одна позиция на строку</span></header>
            <label>В стоимость включено<textarea name="included" rows={5} defaultValue={lines(content.included)} placeholder="Например: проживание\nбилеты\nкоординация"/></label>
            <label>Предоставляет заказчик<textarea name="clientProvides" rows={5} defaultValue={lines(content.clientProvides)} placeholder="Например: спецодежда\nинструмент"/></label>
          </section>

          <section>
            <header><strong>Условия</strong><span>Текст, который будет виден заказчику</span></header>
            <label>Условия сотрудничества<textarea name="terms" rows={5} defaultValue={content.terms ?? ""}/></label>
            <label>Дополнительные условия<textarea name="additionalConditions" rows={4} defaultValue={content.additionalConditions ?? ""}/></label>
            <label>Комментарий в документ<textarea name="comment" rows={3} defaultValue={content.comment ?? ""}/></label>
          </section>

          {error && <div className="form-error proposal-editor-error">{error}</div>}
          <footer className="proposal-editor-actions"><button className="button" type="button" disabled={busy} onClick={() => setOpen(false)}>Отмена</button><button className="button primary" disabled={busy}>{busy ? "Сохранение…" : "Сохранить"}</button></footer>
        </form>
      </aside>
    </>}
  </>;
}
