import { ensureDatabase, getSession, json } from '../../../db/runtime';
type GuestInput = { name: string; type: string; host?: string; note?: string; allocation?: number };
export async function GET(request: Request) { const session = await getSession(request); if (!session) return json({ error: 'Sign in required' }, 401); const db = await ensureDatabase(); const [event, guests, activity] = await Promise.all([db.prepare('SELECT * FROM event_state WHERE id = 1').first(), db.prepare('SELECT id, name, guest_type AS type, host, note, allocation, checked_in AS checked FROM guests ORDER BY id DESC').all(), db.prepare('SELECT action, detail, role_key AS role, created_at AS createdAt FROM activity ORDER BY id DESC LIMIT 12').all()]); return json({ event, guests: guests.results, activity: activity.results, session }); }
export async function POST(request: Request) { const session = await getSession(request); if (!session) return json({ error: 'Sign in required' }, 401); const body = await request.json() as { action?: string; id?: number; amount?: number; direction?: 'in' | 'out'; guests?: GuestInput[]; replace?: boolean; capacity?: number; type?: string }; const db = await ensureDatabase(); const now = new Date().toISOString();
  if (body.action === 'check') { if (!session.permissions.includes('check')) return json({ error: 'Not allowed' }, 403); const amount = Math.max(1, Math.min(50, Number(body.amount) || 1)); const guest = await db.prepare(`WITH before AS MATERIALIZED (SELECT id, checked_in FROM guests WHERE id = ? FOR UPDATE), updated AS (UPDATE guests AS guest SET checked_in = LEAST(guest.allocation, guest.checked_in + ?), updated_at = ? FROM before WHERE guest.id = before.id RETURNING guest.name, guest.allocation, guest.checked_in, before.checked_in AS previous_checked), event_update AS (UPDATE event_state SET inside = inside + (SELECT checked_in - previous_checked FROM updated), updated_at = ? WHERE id = 1 AND EXISTS (SELECT 1 FROM updated)) SELECT name, allocation, checked_in, checked_in - previous_checked AS admitted FROM updated`).bind(body.id, amount, now, now).first<{ name: string; allocation: number; checked_in: number; admitted: number }>(); if (!guest) return json({ error: 'Guest not found' }, 404); if (guest.admitted > 0) await db.prepare('INSERT INTO activity (action, detail, role_key, created_at) VALUES (?, ?, ?, ?)').bind('check-in', `${guest.name}: ${guest.checked_in}/${guest.allocation}`, session.role, now).run(); return json({ checked: guest.checked_in, admitted: guest.admitted }); }
  if (body.action === 'counter') { if (!session.permissions.includes('counter')) return json({ error: 'Not allowed' }, 403); const direction = body.direction === 'out' ? 'out' : 'in'; const statement = direction === 'in' ? 'UPDATE event_state SET inside = inside + 1, normal_entries = normal_entries + 1, updated_at = ? WHERE id = 1' : 'UPDATE event_state SET inside = MAX(0, inside - 1), out_count = out_count + 1, updated_at = ? WHERE id = 1'; await db.batch([db.prepare(statement).bind(now), db.prepare('INSERT INTO activity (action, detail, role_key, created_at) VALUES (?, ?, ?, ?)').bind('counter', direction, session.role, now)]); return json({ event: await db.prepare('SELECT * FROM event_state WHERE id = 1').first() }); }
  if (body.action === 'import') {
    if (!session.permissions.includes('import')) return json({ error: 'Not allowed' }, 403);
    if (body.replace && session.role !== 'admin') return json({ error: 'Only an admin can replace the complete list' }, 403);
    const incoming = (body.guests ?? []).slice(0, 5000);
    if (!incoming.length) return json({ error: 'No guests found in that file' }, 400);
    const uniqueRows = new Map<string, { name: string; normalized_name: string; guest_type: string; host: string; note: string | null; allocation: number; created_at: string; updated_at: string }>();
    for (const guest of incoming) {
      const name = guest.name.trim(); const guestType = guest.type.trim();
      if (!name || !guestType) continue;
      const normalizedName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      uniqueRows.set(`${normalizedName}\u0000${guestType.toLowerCase()}`, { name, normalized_name: normalizedName, guest_type: guestType, host: guest.host || 'PDA', note: guest.note || null, allocation: Math.max(1, Math.min(50, Number(guest.allocation) || 1)), created_at: now, updated_at: now });
    }
    const rows = Array.from(uniqueRows.values());
    if (!rows.length) return json({ error: 'No valid guest names were found' }, 400);
    const rowsJson = JSON.stringify(rows); const queries = [];
    if (body.replace) {
      queries.push(db.prepare('DELETE FROM guests'));
    } else {
      queries.push(db.prepare(`UPDATE guests AS guest SET name = imported.name, guest_type = imported.guest_type, host = imported.host, note = imported.note, allocation = GREATEST(guest.checked_in, imported.allocation), updated_at = imported.updated_at FROM jsonb_to_recordset(?::jsonb) AS imported(name TEXT, normalized_name TEXT, guest_type TEXT, host TEXT, note TEXT, allocation INTEGER, created_at TEXT, updated_at TEXT) WHERE guest.normalized_name = imported.normalized_name AND LOWER(TRIM(guest.guest_type)) = LOWER(TRIM(imported.guest_type))`).bind(rowsJson));
    }
    queries.push(db.prepare(`INSERT INTO guests (name, normalized_name, guest_type, host, note, allocation, checked_in, created_at, updated_at) SELECT imported.name, imported.normalized_name, imported.guest_type, imported.host, imported.note, imported.allocation, 0, imported.created_at, imported.updated_at FROM jsonb_to_recordset(?::jsonb) AS imported(name TEXT, normalized_name TEXT, guest_type TEXT, host TEXT, note TEXT, allocation INTEGER, created_at TEXT, updated_at TEXT) WHERE NOT EXISTS (SELECT 1 FROM guests WHERE guests.normalized_name = imported.normalized_name AND LOWER(TRIM(guests.guest_type)) = LOWER(TRIM(imported.guest_type)))`).bind(rowsJson));
    queries.push(db.prepare('INSERT INTO activity (action, detail, role_key, created_at) VALUES (?, ?, ?, ?)').bind(body.replace ? 'replace-list' : 'update-list', `${rows.length} guests`, session.role, now));
    await db.batch(queries); return json({ imported: rows.length, mode: body.replace ? 'replace' : 'update' });
  }
  if (body.action === 'add-guest') {
    if (!session.permissions.includes('import')) return json({ error: 'Not allowed' }, 403);
    const guest = body.guests?.[0];
    if (!guest) return json({ error: 'Enter a name and choose a group' }, 400);
    const name = guest.name.trim(); const guestType = guest.type.trim();
    if (!name || !guestType) return json({ error: 'Enter a name and choose a group' }, 400);
    if (session.role !== 'admin') { const existing = await db.prepare('SELECT 1 AS found FROM guests WHERE LOWER(TRIM(guest_type)) = LOWER(TRIM(?)) LIMIT 1').bind(guestType).first(); if (!existing) return json({ error: 'Only an admin can create a new group' }, 403); }
    const normalizedName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    await db.batch([db.prepare('INSERT INTO guests (name, normalized_name, guest_type, host, note, allocation, checked_in, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)').bind(name, normalizedName, guestType, guest.host || 'Door', guest.note || null, Math.max(1, Math.min(50, Number(guest.allocation) || 1)), now, now), db.prepare('INSERT INTO activity (action, detail, role_key, created_at) VALUES (?, ?, ?, ?)').bind('add-guest', `${name} · ${guestType}`, session.role, now)]);
    return json({ added: name, type: guestType });
  }
  if (['capacity', 'delete-list', 'delete-all', 'reset-event'].includes(body.action ?? '')) {
    if (session.role !== 'admin') return json({ error: 'Admin access required' }, 403);
    if (body.action === 'capacity') { const capacity = Math.round(Number(body.capacity)); if (!Number.isFinite(capacity) || capacity < 1 || capacity > 100000) return json({ error: 'Capacity must be between 1 and 100,000' }, 400); await db.batch([db.prepare('UPDATE event_state SET capacity = ?, updated_at = ? WHERE id = 1').bind(capacity, now), db.prepare('INSERT INTO activity (action, detail, role_key, created_at) VALUES (?, ?, ?, ?)').bind('settings', `capacity: ${capacity}`, session.role, now)]); return json({ capacity }); }
    if (body.action === 'delete-list') { const type = String(body.type ?? '').trim(); if (!type) return json({ error: 'Choose a list to delete' }, 400); await db.batch([db.prepare('DELETE FROM guests WHERE guest_type = ?').bind(type), db.prepare('INSERT INTO activity (action, detail, role_key, created_at) VALUES (?, ?, ?, ?)').bind('delete-list', type, session.role, now)]); return json({ deleted: type }); }
    if (body.action === 'delete-all') { await db.batch([db.prepare('DELETE FROM guests'), db.prepare('INSERT INTO activity (action, detail, role_key, created_at) VALUES (?, ?, ?, ?)').bind('delete-all', 'all guest lists', session.role, now)]); return json({ deleted: 'all' }); }
    await db.batch([db.prepare('UPDATE guests SET checked_in = 0, updated_at = ?').bind(now), db.prepare('UPDATE event_state SET inside = 0, out_count = 0, normal_entries = 0, updated_at = ? WHERE id = 1').bind(now), db.prepare('INSERT INTO activity (action, detail, role_key, created_at) VALUES (?, ?, ?, ?)').bind('reset-event', 'counters and check-ins', session.role, now)]); return json({ reset: true });
  }
  return json({ error: 'Unknown action' }, 400);
}
