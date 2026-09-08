"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RequestExternalState } from "@/lib/commercial/request-intake";

type Props = { requestId: string; state: RequestExternalState; canEdit: boolean };

function dateLabel(value: string | null) {
  if (!value) return "без срока";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU");
}

export function RequestExternalWorkflow({ requestId, state, canEdit }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [days, setDays] = useState("14");
  const activeLink = useMemo(() => state.links.find((item) => !item.revokedAt) ?? null, [state.links]);
  const pending = state.submissions.filter((item) => item.status === "pending");

  async function createLink() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/requests/${requestId}/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiresInDays: days ? Number(days) : null }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось создать ссылку");
      const full = `${window.location.origin}${json.path}`;
      await navigator.clipboard.writeText(full).catch(() => undefined);
      setCopied(true); router.refresh();
    } catch (linkError) { setError(linkError instanceof Error ? linkError.message : "Не удалось создать ссылку"); }
    finally { setBusy(false); }
  }

  async function copyLink(path: string) {
    const full = `${window.location.origin}${path}`;
    try { await navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError("Браузер не разрешил скопировать ссылку. Откройте её и скопируйте адрес вручную."); }
  }

  async function revoke(linkId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/requests/${requestId}/share`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ linkId }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось отозвать ссылку");
      router.refresh();
    } catch (linkError) { setError(linkError instanceof Error ? linkError.message : "Не удалось отозвать ссылку"); }
    finally { setBusy(false); }
  }

  async function review(submissionId: string, decision: "accept" | "reject") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/requests/${requestId}/submissions/${submissionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось обработать версию");
      router.refresh();
    } catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : "Не удалось обработать версию"); }
    finally { setBusy(false); }
  }

  return <div style={{ display: "grid", gap: 14 }}>
    <div>
      <div className="request-status-row" style={{ marginBottom: 8 }}><strong>Внешняя форма</strong>{pending.length > 0 && <span className="request-badge">Новых версий: {pending.length}</span>}</div>
      {activeLink ? <div className="request-external-box">
        <div><strong style={{ display: "block", fontSize: 12 }}>Ссылка активна до {dateLabel(activeLink.expiresAt)}</strong><span className="request-muted">{activeLink.lastOpenedAt ? "Форму уже открывали" : "Ещё не открывали"}{activeLink.submittedAt ? " · данные отправлялись" : ""}</span></div>
        <div className="request-sticky-actions"><button type="button" className="button" onClick={() => copyLink(activeLink.path)}>{copied ? "Скопировано" : "Копировать"}</button>{canEdit && <button type="button" className="button" disabled={busy} onClick={() => revoke(activeLink.id)}>Отозвать</button>}</div>
      </div> : canEdit ? <div className="request-external-box">
        <div><strong style={{ display: "block", fontSize: 12 }}>Ссылка ещё не создана</strong><span className="request-muted">Получатель заполнит форму без регистрации.</span></div>
        <div className="request-sticky-actions"><select aria-label="Срок ссылки" value={days} onChange={(event) => setDays(event.target.value)} style={{ border: "1px solid var(--border,#ddd)", borderRadius: 8, padding: "7px 8px", background: "var(--surface,#fff)", color: "inherit" }}><option value="7">7 дней</option><option value="14">14 дней</option><option value="30">30 дней</option><option value="90">90 дней</option><option value="">Без срока</option></select><button type="button" className="button primary" disabled={busy} onClick={createLink}>Создать и скопировать</button></div>
      </div> : <div className="request-inline-note">Нет активной внешней ссылки.</div>}
    </div>

    {pending.length > 0 && <div className="request-submission-diff"><strong style={{ fontSize: 13 }}>Изменения от получателя</strong>{pending.map((item) => <article className="request-submission-card" key={item.id}>
      <header><strong>{item.payload.title}</strong><span className="request-muted">{item.submittedAt}</span></header>
      <p>{item.payload.location || "Локация не указана"} · позиций {item.payload.roles.length} · старт {item.payload.startDate || "не указан"}</p>
      <details><summary className="request-subtle-action" style={{ cursor: "pointer", marginBottom: 8 }}>Показать присланные данные</summary><div className="request-overview-grid" style={{ marginTop: 10 }}>
        <div className="request-overview-card"><h3>Контакт</h3><strong>{item.payload.intake.contact.name || "Не указан"}</strong><small>{item.payload.intake.contact.phone || item.payload.intake.contact.email || item.payload.intake.contact.messenger || "Контакты не указаны"}</small></div>
        <div className="request-overview-card"><h3>График</h3><strong>{item.payload.intake.schedule.pattern || "Не указан"}</strong><small>{item.payload.intake.schedule.paidHours ? `${item.payload.intake.schedule.paidHours} оплачиваемых часов` : "Оплачиваемые часы не указаны"}</small></div>
        <div className="request-overview-card"><h3>Коммерция</h3><strong>{item.payload.intake.commercial.clientLimit ? `${item.payload.intake.commercial.clientLimit} ₽` : "Лимит не указан"}</strong><small>{item.payload.intake.commercial.billingUnit}</small></div>
      </div></details>
      {canEdit && <div className="request-submission-actions"><button type="button" className="button primary" disabled={busy} onClick={() => review(item.id, "accept")}>Принять изменения</button><button type="button" className="button" disabled={busy} onClick={() => review(item.id, "reject")}>Отклонить</button></div>}
    </article>)}</div>}
    {error && <div className="form-error">{error}</div>}
  </div>;
}
