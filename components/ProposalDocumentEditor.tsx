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
    setBusy(true); setError("");
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
    const response = await fetch(`/api/proposals/${proposalId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(json.error ?? "Не удалось сохранить КП"); return; }
    setOpen(false); router.refresh();
  }

  return <>
    <button className="button" type="button" onClick={() => setOpen(true)}>Редактировать клиентскую часть</button>
    {open && <><div className="drawer-backdrop" onClick={() => setOpen(false)} /><aside className="drawer commercial-drawer">
      <button className="icon-button drawer-close" type="button" onClick={() => setOpen(false)}>×</button>
      <span className="eyebrow">Коммерческое предложение</span><h2>Клиентская часть</h2>
      <div className="foundation-notice"><strong>Экономика связана с согласованными расчётами</strong><span>Ставки и позиции здесь не меняются. Для изменения цены создайте новый расчёт, согласуйте его и выпустите новую версию КП.</span></div>
      <form className="login-form commercial-form" style={{ marginTop: 18 }} onSubmit={save}>
        <label className="span-2">Объект / название предложения<input name="objectName" required defaultValue={content.objectName ?? content.title ?? ""} /></label>
        <label className="span-2">Описание<textarea name="description" rows={4} defaultValue={content.description ?? ""} /></label>
        <label>Срок действия<input type="date" name="validUntil" defaultValue={content.validUntil ?? ""} /></label>
        <label>График / объём<input name="schedule" defaultValue={content.schedule ?? ""} /></label>
        <label className="span-2">В ставку включено<textarea name="included" rows={5} defaultValue={lines(content.included)} placeholder="Одна позиция на строку" /></label>
        <label className="span-2">Предоставляет заказчик<textarea name="clientProvides" rows={5} defaultValue={lines(content.clientProvides)} placeholder="Одна позиция на строку" /></label>
        <label className="span-2">Условия сотрудничества<textarea name="terms" rows={5} defaultValue={content.terms ?? ""} /></label>
        <label className="span-2">Дополнительные условия<textarea name="additionalConditions" rows={4} defaultValue={content.additionalConditions ?? ""} /></label>
        <label className="span-2">Комментарий в документ<textarea name="comment" rows={3} defaultValue={content.comment ?? ""} /></label>
        {error && <div className="form-error span-2">{error}</div>}
        <div className="span-2"><button className="button primary" disabled={busy}>{busy ? "Сохранение…" : "Сохранить клиентскую часть"}</button></div>
      </form>
    </aside></>}
  </>;
}
