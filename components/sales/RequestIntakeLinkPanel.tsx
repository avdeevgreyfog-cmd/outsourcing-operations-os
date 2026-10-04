"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, X } from "lucide-react";

type IntakeLink = { path: string; expiresAt: string | null; submissionCount: number; ownerName: string; canManage: boolean };

export function RequestIntakeLinkPanel({ demo, onClose }: { demo: boolean; onClose: () => void }) {
  const [link, setLink] = useState<IntakeLink | null>(null);
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(!demo);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch("/api/requests/intake-link", { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить ссылку");
      setLink(result);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить ссылку"); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [demo]);
  async function create() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/requests/intake-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiresInDays: days === "none" ? null : Number(days) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось создать ссылку");
      setLink(result);
      setMessage("Ссылка готова. Передайте её заказчику.");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось создать ссылку"); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!link) return;
    setError("");
    try { await navigator.clipboard.writeText(`${origin}${link.path}`); setMessage("Ссылка скопирована"); }
    catch { setError("Не удалось скопировать автоматически. Выделите ссылку и скопируйте её вручную."); }
  }
  async function revoke() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/requests/intake-link", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Не удалось отключить ссылку");
      setLink(null); setConfirmRevoke(false); setMessage("Ссылка отключена. Ранее полученные заявки сохранены.");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось отключить ссылку"); }
    finally { setBusy(false); }
  }
  return <section className="section request-intake-link-panel" aria-label="Форма для заказчика" aria-busy={busy}>
    <header className="section-head"><div><h2><Link2 size={16}/> Форма для заказчика</h2><p>Каждое заполнение создаёт новую заявку. Для уточнения существующей используйте действие в её карточке.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть настройки ссылки"><X size={17}/></button></header>
    {demo ? <p className="sales-secondary">В демо внешняя ссылка не создаётся: она должна сохранять заявки в базе компании. Проверить создание в демо можно через «Новая заявка».</p> : busy && !link ? <p role="status">Загружаю ссылку…</p> : link ? <>
      <div className="request-intake-link-copy"><label>Ссылка компании<input readOnly value={`${origin}${link.path}`} onFocus={event => event.currentTarget.select()}/></label><button type="button" className="button" onClick={copy} disabled={busy}><Copy size={15}/>Скопировать</button></div>
      <dl className="request-intake-link-facts"><div><dt>Ответственный за новые заявки</dt><dd>{link.ownerName}</dd></div><div><dt>Срок действия</dt><dd>{link.expiresAt ? `До ${new Date(link.expiresAt).toLocaleDateString("ru-RU")}` : "Без ограничения"}</dd></div><div><dt>Получено заявок</dt><dd>{link.submissionCount}</dd></div></dl>
      {link.canManage && <div className="request-intake-link-revoke">{confirmRevoke ? <><span>Отключить эту ссылку? Заказчики больше не смогут отправлять по ней заявки.</span><button className="button" type="button" disabled={busy} onClick={revoke}>Отключить ссылку</button><button className="button" type="button" disabled={busy} onClick={() => setConfirmRevoke(false)}>Отмена</button></> : <button className="button" type="button" onClick={() => setConfirmRevoke(true)}>Отключить ссылку</button>}</div>}
    </> : <div className="request-intake-link-create"><label>Срок действия<select value={days} onChange={event => setDays(event.target.value)}><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option><option value="none">Без ограничения</option></select></label><button className="button primary" type="button" disabled={busy} onClick={create}>Создать ссылку</button><p>Новые заявки будут назначаться создателю ссылки. В компании используется одна общая активная ссылка.</p></div>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="sales-notice sales-notice-error">{error}</p>}
  </section>;
}
