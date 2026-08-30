# Outsourcing Operations OS

Единая операционная система компании кадрового и производственного аутсорсинга.

Основной lineage:

`Client → Request → Calculation → Proposal → Object → Need → CandidateApplication → Candidate → Worker → Assignment → Shift → TimeEntry → Timesheet → Accrual → Payment → P&L`

## Текущий статус

Phase 2 превращает архитектурный first pass в связанный рабочий интерфейс. Реализованы:

- tenant-aware Next.js application с PostgreSQL RLS;
- серверная авторизация: role template + capability + scope + individual allow/deny;
- отдельные field capabilities для компенсации и платежей;
- трёхуровневая навигация, compact mode и Ctrl+K;
- reusable data-grid foundation;
- карточки клиента, заявки, объекта, кандидата и сотрудника;
- реальные contextual tabs объекта и профиля сотрудника;
- recruiting Kanban и реестр кандидатов;
- resource scheduler с detail drawer;
- месячный клиентский/внутренний табель и workflow сверки;
- grouped-cost calculator с моделями, bases и custom expenses;
- предложения, база ставок, начисления, авансы и выплаты;
- P&L, сравнение объектов и workforce view;
- launch Gantt/WBS и incidents foundation;
- серверный редактор индивидуальных access overrides;
- audit для высокорисковых изменений.

Phase 2 не объявлен production-ready: фактический PostgreSQL migration/RLS прогон и browser visual regression в deployment environment ещё обязательны. Подробности: `docs/PHASE_2_STATUS.md` и `docs/QA_REPORT.md`.

## Stack

- Next.js 16.3.3, React 19.2, TypeScript
- PostgreSQL через `postgres`
- Zod
- Apache ECharts 6
- Lucide icons
- Playwright QA harness

## Локальный запуск

```bash
cp .env.example .env.local
npm install
npm run db:setup
npm run dev -- -H 127.0.0.1
```

Для read-only UI-проверки без PostgreSQL установите `DEMO_MODE=true`. Demo snapshot синтетический и не сохраняет бизнес-данные в браузере.

## Проверки

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:browser
```

Browser QA требует запущенный dev-server на `http://127.0.0.1:3000`.

## Документация

- `docs/PHASE_2_ARCHITECTURE.md`
- `docs/UI_SYSTEM.md`
- `docs/ACCESS_MODEL.md`
- `docs/SECURITY.md`
- `docs/QA_REPORT.md`
