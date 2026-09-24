// Opt-in integration check: every table is TEMP and dropped at transaction end.
// Never calls application initializers or reads/writes live guest records.
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
if (process.env.PDA_VERIFY_STORAGE !== '1') { console.log('Storage integration check is opt-in.'); process.exit(0); }
if (!process.env.DATABASE_URL || process.env.DATABASE_URL === '[SENSITIVE]') throw new Error('Database configuration required');
const sql = neon(process.env.DATABASE_URL);
const door = readFileSync(new URL('../app/api/door/route.ts', import.meta.url), 'utf8').match(/db\.prepare\(`(WITH changed AS[\s\S]*?)`\)/)[1];
const banned = readFileSync(new URL('../app/api/banned/route.ts', import.meta.url), 'utf8').match(/db\.prepare\(`(WITH saved AS[\s\S]*?)`\)/)[1];
const query = (source, values = []) => { let n = 0; return sql.query(source.replace(/\?/g, () => '$' + ++n), values); };
const check = (version, checked, delta) => query(door, ['[]', checked, 'test', 1, version, delta, 'test', 'test', 'fixture only', 'picker', 'test']);
const results = await sql.transaction([
  query('CREATE TEMP TABLE guests(id INTEGER PRIMARY KEY, door_people JSONB, checked_in INTEGER, door_version INTEGER, updated_at TEXT) ON COMMIT DROP'),
  query('CREATE TEMP TABLE event_state(id INTEGER PRIMARY KEY, inside INTEGER, updated_at TEXT) ON COMMIT DROP'),
  query('CREATE TEMP TABLE activity(action TEXT, detail TEXT, role_key TEXT, created_at TEXT) ON COMMIT DROP'),
  query('CREATE TEMP TABLE door_bans(id TEXT PRIMARY KEY, record JSONB, version INTEGER) ON COMMIT DROP'),
  query('CREATE TEMP TABLE door_photos(id TEXT PRIMARY KEY, ban_id TEXT, jpeg TEXT) ON COMMIT DROP'),
  query("INSERT INTO guests VALUES (1, NULL, 0, 0, 'test')"),
  query("INSERT INTO event_state VALUES (1, 10, 'test')"),
  check(0, 1, 1),
  check(0, 1, 1),
  check(1, 1, 0),
  check(2, 0, -1),
  query(banned, ['fixture', '{"name":"Sample"}', -1, '[{"id":"photo","jpeg":"fixture"}]']),
  query(banned, ['fixture', '{"name":"Updated"}', 0, '[]']),
  query(banned, ['fixture', '{"name":"Stale overwrite"}', 0, '[]']),
  query("SELECT (SELECT inside FROM event_state) AS inside, (SELECT door_version FROM guests) AS version, (SELECT COUNT(*)::int FROM activity) AS actions, (SELECT record->>'name' FROM door_bans) AS name, (SELECT COUNT(*)::int FROM door_photos) AS photos"),
]);
assert.equal(results[8].length, 0, 'stale admission must not double count');
assert.equal(results[13].length, 0, 'stale directory edit must not overwrite');
assert.deepEqual(results.at(-1)[0], { inside: 10, version: 3, actions: 3, name: 'Updated', photos: 1 });
console.log('Atomic admission, stale-write protection, refusal delta, private photo storage: passed. Temporary tables dropped.');
