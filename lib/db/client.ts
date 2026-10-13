import postgres, { type Sql, type TransactionSql } from "postgres";

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

function scopedTransaction(tx: TransactionSql): Sql {
  // Existing services call sql.begin inside withTenant. A nested operation must
  // use a savepoint on this connection, retaining the tenant and outer rollback.
  type Callback = (sql: Sql) => unknown;
  const begin = (options: string | Callback, callback?: Callback) => {
    const action = typeof options === "function" ? options : callback;
    if (!action) throw new Error("A transaction callback is required");
    if (typeof options === "string" && options.trim()) {
      throw new Error("Nested tenant transactions cannot change transaction options");
    }
    return tx.savepoint(inner => action(scopedTransaction(inner)) as Promise<unknown>);
  };
  return Object.assign(tx, { begin }) as unknown as Sql;
}

export async function withTenant<T>(organizationId: string, userId: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = db();
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    await tx`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(scopedTransaction(tx));
  }) as Promise<T>;
}
