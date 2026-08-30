# Outsourcing Operations OS

Production-oriented operations platform for staffing / production outsourcing.

Core lineage:

`Lead → Request → Calculation → Proposal → Object → Need → Candidate → Worker → Shift → Attendance → Timesheet → Accrual → Payment → P&L`

## Status

This repository contains the first platform/backbone pass. It is intentionally a new codebase: the legacy `r-kadry-os` UI/CSS/localStorage implementation is not reused.

## Stack

- Next.js 16.3.3 + React 19.2 + TypeScript
- PostgreSQL via `postgres`
- Zod
- TanStack Table v9
- Apache ECharts 6
- SQL migrations with PostgreSQL RLS tenant boundary

## Start

```bash
cp .env.example .env.local
npm install
npm run db:setup
npm run dev
```

For a UI-only inspection without a database, keep `DEMO_MODE=true`. Read-only seeded snapshot data is used only as a local fallback; production writes are never persisted to localStorage.

## Security boundary

Navigation hiding is convenience only. Server queries/actions call authorization helpers and database sessions set organization/user context. PostgreSQL RLS enforces organization isolation on protected business tables.

See `docs/ARCHITECTURE_DECISIONS.md` and `docs/FIRST_PASS_STATUS.md`.
