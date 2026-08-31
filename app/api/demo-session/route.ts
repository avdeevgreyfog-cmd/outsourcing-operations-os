import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/auth/server";

const allowed = new Set(["director","sales","regional","object","recruiter","economist","finance"]);
export async function POST(request: Request) {
  if (process.env.DEMO_MODE !== "true") return NextResponse.json({ error: "Демонстрационный режим отключён" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const role = allowed.has(body.role) ? body.role : "director";
  const response = NextResponse.json({ ok: true, role });
  response.cookies.set(DEMO_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}

