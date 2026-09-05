import { env } from 'cloudflare:workers';
const statements = [
  `CREATE TABLE IF NOT EXISTS guests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, normalized_name TEXT NOT NULL, guest_type TEXT NOT NULL, host TEXT NOT NULL DEFAULT 'PDA', note TEXT, allocation INTEGER NOT NULL DEFAULT 1, checked_in INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_guests_normalized_name ON guests(normalized_name)`,
  `CREATE INDEX IF NOT EXISTS idx_guests_guest_type ON guests(guest_type)`,
  `CREATE TABLE IF NOT EXISTS event_state (id INTEGER PRIMARY KEY, title TEXT NOT NULL, venue TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 550, inside INTEGER NOT NULL DEFAULT 0, out_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS staff_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, role_key TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL, permissions TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS staff_sessions (token_hash TEXT PRIMARY KEY, role_key TEXT NOT NULL, expires_at TEXT NOT NULL, created_by TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_staff_sessions_expiry ON staff_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, detail TEXT NOT NULL, role_key TEXT NOT NULL, created_at TEXT NOT NULL)`,
];
export async function ensureDatabase() { if (!env.DB) throw new Error('Database unavailable'); await env.DB.batch(statements.map((statement) => env.DB.prepare(statement))); const now = new Date().toISOString(); await env.DB.prepare(`INSERT OR IGNORE INTO event_state (id, title, venue, capacity, inside, out_count, updated_at) VALUES (1, 'Public Display of Affection', 'Berlin', 550, 0, 0, ?)` ).bind(now).run(); return env.DB; }
export async function sha256(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
export async function hashPin(pin: string, salt: string) { return sha256(`${salt}:${pin}`); }
export async function getSession(request: Request) { const token = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)pda_session=([^;]+)/)?.[1]; if (!token) return null; const db = await ensureDatabase(); const row = await db.prepare(`SELECT staff_sessions.role_key, staff_roles.permissions FROM staff_sessions JOIN staff_roles ON staff_roles.role_key = staff_sessions.role_key WHERE token_hash = ? AND expires_at > ?`).bind(await sha256(token), new Date().toISOString()).first<{ role_key: string; permissions: string }>(); return row ? { role: row.role_key, permissions: JSON.parse(row.permissions) as string[] } : null; }
export function json(data: unknown, status = 200, headers?: HeadersInit) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } }); }
