"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateClientButton() {
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function close() {
    if (busy) return;
    setOpen(false);
    setContactOpen(false);
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(event.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      legalName: String(fd.get("legalName") ?? "").trim() || undefined,
      inn: String(fd.get("inn") ?? "").trim() || undefined,
      contact: contactOpen ? {
        name: String(fd.get("contactName") ?? "").trim(),
        phone: String(fd.get("contactPhone") ?? "").trim() || undefined,
        email: String(fd.get("contactEmail") ?? "").trim() || undefined,
      } : undefined,
    };

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось создать клиента");
      setOpen(false);
      setContactOpen(false);
      router.push(`/clients/${json.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать клиента");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="button primary" type="button" onClick={() => setOpen(true)}>+ Клиент</button>
    {open && <>
      <div className="drawer-backdrop" onClick={close}/>
      <aside className="drawer client-create-drawer" role="dialog" aria-modal="true" aria-label="Создание клиента">
        <header className="client-drawer-head">
          <div><span className="eyebrow">Клиенты</span><h2>Новый клиент</h2><p>Добавьте основные данные. Остальную информацию можно заполнить уже в карточке клиента.</p></div>
          <button className="icon-button" type="button" onClick={close} aria-label="Закрыть">×</button>
        </header>

        <form className="client-create-form" onSubmit={submit}>
          <section className="client-form-section">
            <div className="client-form-section-head"><strong>Основные данные</strong><span>Минимум, необходимый для создания карточки</span></div>
            <label>Рабочее название <b>*</b><input name="name" required autoFocus placeholder="Например, НордЛог"/><small>Так клиент будет отображаться в системе.</small></label>
            <label>Юридическое наименование<input name="legalName" placeholder="ООО «НордЛог»"/></label>
            <label>ИНН<input name="inn" inputMode="numeric" autoComplete="off" placeholder="7701234567"/></label>
          </section>

          <section className="client-form-section client-contact-section">
            <div className="client-form-section-head client-contact-head">
              <div><strong>Первый контакт</strong><span>Необязательно, но удобно для дальнейшей работы</span></div>
              {!contactOpen && <button className="button ghost" type="button" onClick={() => setContactOpen(true)}>+ Добавить контакт</button>}
            </div>
            {contactOpen && <div className="client-contact-fields">
              <label>Контактное лицо <b>*</b><input name="contactName" required placeholder="Имя и фамилия"/></label>
              <label>Телефон<input name="contactPhone" type="tel" placeholder="+7 999 000-00-00"/></label>
              <label>Эл. почта<input name="contactEmail" type="email" placeholder="name@company.ru"/></label>
              <button className="client-contact-remove" type="button" onClick={() => setContactOpen(false)}>Убрать контакт</button>
            </div>}
          </section>

          {error && <div className="form-error client-create-error">{error}</div>}

          <footer className="client-drawer-actions">
            <button className="button" type="button" disabled={busy} onClick={close}>Отмена</button>
            <button className="button primary" type="submit" disabled={busy}>{busy ? "Создание…" : "Создать клиента"}</button>
          </footer>
        </form>
      </aside>
    </>}
  </>;
}
