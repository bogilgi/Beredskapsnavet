import "server-only";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

// En enda anslutning per process. Cachas på globalThis så att Next.js
// hot reload i utvecklingsläge inte öppnar nya handtag vid varje ändring.
const globalForDb = globalThis as unknown as { __beredskapDb?: DatabaseSync };

function open(): DatabaseSync {
  // Samma styrning som i seed-skriptet: BEREDSKAP_DB pekar ut filen när den
  // ligger någon annanstans än i projektets db-katalog.
  const db = new DatabaseSync(
    process.env.BEREDSKAP_DB || join(process.cwd(), "db", "beredskap.db"),
  );
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function db(): DatabaseSync {
  if (!globalForDb.__beredskapDb) globalForDb.__beredskapDb = open();
  return globalForDb.__beredskapDb;
}

/** Hämtar alla rader som vanliga objekt. */
export function all<T>(sql: string, ...params: unknown[]): T[] {
  const rows = db()
    .prepare(sql)
    .all(...(params as never[]));
  return rows.map((r) => ({ ...r })) as T[];
}

/** Hämtar första raden, eller undefined. */
export function one<T>(sql: string, ...params: unknown[]): T | undefined {
  const row = db()
    .prepare(sql)
    .get(...(params as never[]));
  return row ? ({ ...row } as T) : undefined;
}

export function run(sql: string, ...params: unknown[]) {
  return db()
    .prepare(sql)
    .run(...(params as never[]));
}

/**
 * Skriver till spårbarhetsloggen. Anropas vid varje ändring.
 * orgId är null för händelser som sker utanför en organisation, som inloggning.
 */
export function logga(
  orgId: number | null,
  anvandare: string,
  handelse: string,
  objekt = "",
) {
  run(
    "INSERT INTO audit_log (org_id, tidpunkt, anvandare, handelse, objekt) VALUES (?, ?, ?, ?, ?)",
    orgId,
    new Date().toISOString().slice(0, 19),
    anvandare,
    handelse,
    objekt,
  );
}
