import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db, hasDatabase } from "@/lib/db/client";
import { hashSessionToken, SESSION_COOKIE } from "@/lib/auth/server";

export async function POST(request: Request) {
  if (!hasDatabase()) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const organization = String(body.organization ?? "operis-demo").trim().toLowerCase();
  if (!email || !password || !organization) return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  const sql = db();
  const [row] = await sql<{ user_id: string; organization_id: string; password_ok: boolean }[]>`
    SELECT u.id user_id, o.id organization_id, (u.password_hash IS NOT NULL AND u.password_hash = crypt(${password}, u.password_hash)) password_ok
    FROM app_users u
    JOIN organization_memberships m ON m.user_id=u.id AND m.status='active'
    JOIN organizations o ON o.id=m.organization_id
    WHERE lower(u.email::text)=lower(${email}) AND o.slug=${organization} AND u.is_active=true
    LIMIT 1
  `;
  if (!row?.password_ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = hashSessionToken(raw);
  await sql`INSERT INTO sessions (organization_id,user_id,token_hash,expires_at) VALUES (${row.organization_id}::uuid,${row.user_id}::uuid,${hash},now()+interval '12 hours')`;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60*60*12 });
  return response;
}
