import { isStaffRole, staffRoles } from '../lib/staff-roles';
import { neon } from '@neondatabase/serverless';

const statements = [
  `CREATE TABLE IF NOT EXISTS guests (id SERIAL PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL, guest_type TEXT NOT NULL, host TEXT NOT NULL DEFAULT 'PDA', note TEXT, allocation INTEGER NOT NULL DEFAULT 1, checked_in INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_guests_normalized_name ON guests(normalized_name)`,
  `CREATE INDEX IF NOT EXISTS idx_guests_guest_type ON guests(guest_type)`,
  `CREATE TABLE IF NOT EXISTS event_state (id INTEGER PRIMARY KEY, title TEXT NOT NULL, venue TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 550, inside INTEGER NOT NULL DEFAULT 0, out_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `ALTER TABLE event_state ADD COLUMN IF NOT EXISTS normal_entries INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE event_state ADD COLUMN IF NOT EXISTS entry_stats_ready BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS staff_roles (id SERIAL PRIMARY KEY, role_key TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL, permissions TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS staff_sessions (token_hash TEXT PRIMARY KEY, role_key TEXT NOT NULL, expires_at TEXT NOT NULL, created_by TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_staff_sessions_expiry ON staff_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS activity (id SERIAL PRIMARY KEY, action TEXT NOT NULL, detail TEXT NOT NULL, role_key TEXT NOT NULL, created_at TEXT NOT NULL)`,
];

type QueryResult<T = Record<string, unknown>> = { results: T[] };

function postgresQuery(source: string) {
  let parameter = 0;
  return source
    .replace(/\?/g, () => `$${++parameter}`)
    .replace(/MAX\(0, inside - 1\)/g, 'GREATEST(0, inside - 1)');
}

function getClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  return neon(databaseUrl);
}

function prepare(source: string) {
  const query = postgresQuery(source);
  let parameters: unknown[] = [];
  const execute = async <T = Record<string, unknown>>() => {
    const rows = await getClient().query(query, parameters) as T[];
    return rows;
  };
  return {
    bind(...values: unknown[]) { parameters = values; return this; },
    async run() { await execute(); return { success: true }; },
    async first<T = Record<string, unknown>>() { return (await execute<T>())[0] ?? null; },
    async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> { return { results: await execute<T>() }; },
  };
}

const database = {
  prepare,
  async batch(queries: Array<ReturnType<typeof prepare>>) {
    const results = [];
    for (const query of queries) results.push(await query.run());
    return results;
  },
};

let initialization: Promise<void> | undefined;

async function initializeDatabase() {
  for (const statement of statements) await prepare(statement).run();
  const now = new Date().toISOString();
  await prepare(`INSERT INTO event_state (id, title, venue, capacity, inside, out_count, updated_at) VALUES (1, 'Public Display of Affection', 'Berlin', 550, 0, 0, ?) ON CONFLICT (id) DO NOTHING`).bind(now).run();
  await prepare(`UPDATE event_state SET normal_entries = GREATEST(0, inside + out_count - COALESCE((SELECT SUM(checked_in) FROM guests), 0)), entry_stats_ready = TRUE WHERE id = 1 AND entry_stats_ready = FALSE`).run();
}

export async function ensureDatabase() {
  initialization ??= initializeDatabase().catch((error) => { initialization = undefined; throw error; });
  await initialization;
  return database;
}
export async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
export async function hashPin(pin: string, salt: string) { return sha256(`${salt}:${pin}`); }
export async function getSession(request: Request) { const token = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)pda_session=([^;]+)/)?.[1]; if (!token) return null; const db = await ensureDatabase(); const row = await db.prepare(`SELECT role_key FROM staff_sessions WHERE token_hash = ? AND expires_at > ?`).bind(await sha256(token), new Date().toISOString()).first<{ role_key: string; permissions: string }>(); return row && isStaffRole(row.role_key) ? { role: row.role_key, permissions: [...staffRoles[row.role_key].permissions] } : null; }
export function json(data: unknown, status = 200, headers?: HeadersInit) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } }); }
