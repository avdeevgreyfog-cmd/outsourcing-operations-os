import postgres, { type Sql } from "postgres";

let singleton: Sql | null = null;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function db(): Sql {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!singleton) {
    singleton = postgres(process.env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return singleton;
}

export async function withTenant<T>(organizationId: string, userId: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = db();
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    await tx`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
