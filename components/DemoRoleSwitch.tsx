"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const groups = [
  {
    label: "Руководство",
    people: [
      { code: "director", userId: "10000000-0000-4000-8000-000000000001", name: "Анна Лебедева", position: "Генеральный директор / собственник" },
    ],
  },
  {
    label: "Коммерция",
    people: [
      { code: "sales", userId: "10000000-0000-4000-8000-000000000002", name: "Михаил Соколов", position: "Руководитель коммерческого направления" },
      { code: "client", userId: "10000000-0000-4000-8000-000000000008", name: "Анна Воронова", position: "Менеджер по клиентским заявкам" },
      { code: "client_2", userId: "10000000-0000-4000-8000-000000000009", name: "Елена Морозова", position: "Менеджер по клиентским заявкам" },
    ],
  },
  {
    label: "Операции",
    people: [
      { code: "regional", userId: "10000000-0000-4000-8000-000000000003", name: "Алексей Громов", position: "Руководитель объектов" },
      { code: "object", userId: "10000000-0000-4000-8000-000000000004", name: "Дмитрий Орлов", position: "Менеджер объекта" },
      { code: "object_2", userId: "10000000-0000-4000-8000-000000000010", name: "Павел Никитин", position: "Менеджер объекта" },
    ],
  },
  {
    label: "Обеспечение",
    people: [
      { code: "supply", userId: "10000000-0000-4000-8000-000000000011", name: "Ирина Белова", position: "Снабжение и документооборот" },
    ],
  },
  {
    label: "Подбор",
    people: [
      { code: "recruiter", userId: "10000000-0000-4000-8000-000000000005", name: "Мария Лебедева", position: "Руководитель отдела подбора" },
      { code: "recruiter_staff", userId: "10000000-0000-4000-8000-000000000012", name: "Ольга Зайцева", position: "Менеджер по подбору" },
      { code: "recruiter_staff_2", userId: "10000000-0000-4000-8000-000000000013", name: "Ксения Волкова", position: "Менеджер по подбору" },
      { code: "recruiter_staff_3", userId: "10000000-0000-4000-8000-000000000014", name: "Наталья Фомина", position: "Менеджер по подбору" },
    ],
  },
  {
    label: "Экономика и финансы",
    people: [
      { code: "economist", userId: "10000000-0000-4000-8000-000000000006", name: "Елена Котова", position: "Экономист / финансовый менеджер" },
    ],
  },
] as const;

export function DemoRoleSwitch({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const current = useMemo(
    () => groups.flatMap(group => group.people).find(person => person.userId === currentUserId)?.code ?? "director",
    [currentUserId],
  );

  function change(code: string) {
    setBusy(true);
    document.cookie = `oo_demo_role=${encodeURIComponent(code)}; Path=/; Max-Age=2592000; SameSite=Lax`;
    router.push("/");
    router.refresh();
    setBusy(false);
  }

  return (
    <label className="demo-role">
      <span>От лица</span>
      <select disabled={busy} value={current} onChange={(event) => change(event.target.value)} aria-label="Проверить систему от лица сотрудника">
        {groups.map(group => (
          <optgroup key={group.label} label={group.label}>
            {group.people.map(person => <option key={person.code} value={person.code}>{person.name} — {person.position}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
