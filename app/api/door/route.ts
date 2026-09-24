import { ensureDatabase, getSession, json } from '../../../db/runtime';
import { guestParty, type DoorGuest } from '../../../lib/door-live';
import { applyDoorAction, personState, undoDoorAction, type DoorAction, type DoorEvent, type DoorRole } from '../../../lib/door-preview';
import { staffRoles } from '../../../lib/staff-roles';

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Please sign in again.' }, 401);
  const db = await ensureDatabase();
  const [guests, bans, event] = await Promise.all([
    db.prepare('SELECT * FROM guests ORDER BY id DESC').all<DoorGuest>(),
    db.prepare('SELECT record, version FROM door_bans ORDER BY id DESC').all<{ record: object; version: number }>(),
    db.prepare('SELECT * FROM event_state WHERE id = 1').first(),
  ]);
  return json({ parties: guests.results.map(guestParty), bans: bans.results.map(row => ({ ...row.record, version: row.version })), event, session });
}

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Please sign in again.' }, 401);
  if (!session.permissions.includes('check')) return json({ error: 'Not allowed' }, 403);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Not allowed' }, 403);
  let body: Record<string, unknown>;
  try { const parsed = await request.json(); if (!parsed || typeof parsed !== 'object') throw new Error(); body = parsed as Record<string, unknown>; } catch { return json({ error: 'Invalid request' }, 400); }
  const { action, partyId, personId, requestId, targetId } = body;
  if (typeof action !== 'string' || !['check', 'refuse', 'reverse', 'note', 'undo'].includes(action) || !Number.isSafeInteger(Number(partyId)) || typeof personId !== 'string' || typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId) || (action === 'undo' && typeof targetId !== 'string')) return json({ error: 'Invalid action' }, 400);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 2000 || (action === 'note' && !note)) return json({ error: 'Enter a note of up to 2,000 characters.' }, 400);
  const db = await ensureDatabase();
  const role = staffRoles[session.role].label as DoorRole;
  const now = new Date().toISOString();
  // Compare-and-swap keeps the person's record and event count in one atomic statement.
  // Re-read on conflicts so simultaneous checks from different doors are retained.
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db.prepare('SELECT * FROM guests WHERE id = ?').bind(Number(partyId)).first<DoorGuest>();
    if (!row) return json({ error: 'This guest is no longer on the list.' }, 404);
    const party = guestParty(row);
    const person = party.people.find(item => item.id === personId);
    if (!person) return json({ error: 'Person not found.' }, 404);
    if (person.events.some(event => event.id === requestId)) return json({ ok: true });
    const previous = personState(person).status;
    if (action === 'check' && previous === 'refused') return json({ error: 'Entry is refused. Open Notes & checks to reverse it first.' }, 409);
    if (action === 'reverse' && previous !== 'refused') return json({ error: 'The refusal has already changed. Please refresh.' }, 409);
    if (action === 'undo' && !person.events.some(event => event.id === targetId)) return json({ error: 'Action not found.' }, 404);
    const event: DoorEvent = { id: requestId, personId, action: action as DoorAction, note, role, staff: session.staff, at: now };
    const next = action === 'undo' ? undoDoorAction(person, targetId as string, { staff: session.staff, role, at: now }) : applyDoorAction(person, event);
    const people = party.people.map(item => item.id === personId ? next : item);
    const checked = people.filter(item => personState(item).status === 'inside').length;
    const delta = checked - row.checked_in;
    const saved = await db.prepare(`WITH changed AS (
      UPDATE guests SET door_people = ?::jsonb, checked_in = ?, door_version = door_version + 1, updated_at = ?
      WHERE id = ? AND door_version = ? RETURNING id
    ), counted AS (
      UPDATE event_state SET inside = GREATEST(0, inside + ?), updated_at = ?
      WHERE id = 1 AND EXISTS (SELECT 1 FROM changed) RETURNING id
    ), logged AS (
      INSERT INTO activity(action, detail, role_key, created_at)
      SELECT ?, ?, ?, ? FROM changed
    ) SELECT id FROM changed`).bind(JSON.stringify(people), checked, now, row.id, row.door_version, delta, now, action, `${row.name} · ${session.staff}`, session.role, now).first();
    if (saved) return json({ ok: true });
  }
  return json({ error: 'Another teammate is updating this guest. Please try again.' }, 409);
}
