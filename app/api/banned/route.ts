import { ensureDatabase, getSession, json } from '../../../db/runtime';
import { staffRoles } from '../../../lib/staff-roles';
import { canArchiveBan, changeBanArchive } from '../../../lib/ban-archive';
import type { BanRecord, DoorRole } from '../../../lib/door-preview';

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Please sign in again.' }, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Not allowed' }, 403);
  const raw = await request.text();
  if (raw.length > 3_000_000) return json({ error: 'Photos are too large. Please choose smaller copies.' }, 413);
  let body;
  try { body = JSON.parse(raw); if (!body || typeof body !== 'object') throw new Error(); } catch { return json({ error: 'Invalid record' }, 400); }
  if (body.action === 'archive' || body.action === 'restore') {
    if (!canArchiveBan(session.role)) return json({ error: 'Only Admin and Manager can archive or restore records.' }, 403);
    if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id) || !Number.isSafeInteger(body.version) || body.version < 0) return json({ error: 'Invalid record' }, 400);
    const db = await ensureDatabase();
    const existing = await db.prepare('SELECT record, version FROM door_bans WHERE id = ?').bind(body.id).first<{ record: BanRecord; version: number }>();
    if (!existing) return json({ error: 'Record no longer exists.' }, 404);
    if (body.version !== existing.version) return json({ error: 'Someone updated this record. Close it and reopen before continuing.' }, 409);
    const record = changeBanArchive(existing.record, body.action, { staff: session.staff, role: staffRoles[session.role].label as DoorRole, at: new Date().toISOString() });
    if (record === existing.record) return json({ ok: true });
    const saved = await db.prepare(`UPDATE door_bans SET record = ?::jsonb, version = version + 1 WHERE id = ? AND version = ? RETURNING id`).bind(JSON.stringify(record), body.id, existing.version).first();
    if (!saved) return json({ error: 'This record changed. Close it and reopen before continuing.' }, 409);
    return json({ ok: true });
  }
  if (body.action !== undefined) return json({ error: 'Invalid action' }, 400);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const id = body.id || body.requestId;
  if (!name || name.length > 150 || note.length > 2000 || typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || !Array.isArray(body.photos) || body.photos.length > 4) return json({ error: 'Check the name, note and photos.' }, 400);
  const db = await ensureDatabase();
  const existing = await db.prepare('SELECT record, version FROM door_bans WHERE id = ?').bind(id).first<{ record: BanRecord; version: number }>();
  if (body.id && !existing) return json({ error: 'Record no longer exists.' }, 404);
  if (existing && !body.id) return json({ ok: true });
  if (existing?.record.archived) return json({ error: 'This record is archived. An Admin or Manager must restore it before editing.' }, 409);
  if (existing && body.version !== existing.version) return json({ error: 'Someone updated this record. Close it and reopen before saving.' }, 409);
  const additions: { id: string; jpeg: string }[] = [];
  const photos: string[] = [];
  for (const photo of body.photos) {
    if (typeof photo !== 'string') return json({ error: 'Invalid photo' }, 400);
    if (existing?.record.photos.includes(photo)) { photos.push(photo); continue; }
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 700_000) return json({ error: 'Use a smaller JPEG photo, or choose the original again.' }, 400);
    const jpeg = photo.split(',')[1];
    const bytes = Buffer.from(jpeg, 'base64');
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return json({ error: 'Invalid JPEG photo' }, 400);
    const photoId = crypto.randomUUID();
    additions.push({ id: photoId, jpeg });
    photos.push(`/api/banned/photo?id=${photoId}`);
  }
  const at = new Date().toISOString(), role = staffRoles[session.role].label as DoorRole;
  const record: BanRecord = { ...(existing?.record || { id, staff: session.staff, role, at, notes: [] }), name, photos, notes: [...(existing?.record.notes || []), ...(note ? [{ text: note, staff: session.staff, role, at }] : [])] };
  const saved = await db.prepare(`WITH saved AS (
    INSERT INTO door_bans(id, record, version) VALUES (?, ?::jsonb, 0)
    ON CONFLICT (id) DO UPDATE SET record = EXCLUDED.record, version = door_bans.version + 1
    WHERE door_bans.version = ? RETURNING id
  ), images AS (
    INSERT INTO door_photos(id, ban_id, jpeg)
    SELECT image.id, saved.id, image.jpeg FROM saved CROSS JOIN jsonb_to_recordset(?::jsonb) AS image(id TEXT, jpeg TEXT)
  ) SELECT id FROM saved`).bind(id, JSON.stringify(record), existing?.version ?? -1, JSON.stringify(additions)).first();
  if (!saved) return json({ error: 'This record changed. Close it and reopen before saving.' }, 409);
  return json({ ok: true });
}
