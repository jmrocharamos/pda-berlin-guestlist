import { ensureDatabase, getSession, json } from '../../../../db/runtime';
import { canArchiveBan } from '../../../../lib/ban-archive';

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) return json({ error: 'Sign in required' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return json({ error: 'Photo not found' }, 404);
  const db = await ensureDatabase();
  const row = await db.prepare('SELECT p.jpeg, b.record FROM door_photos p JOIN door_bans b ON b.id = p.ban_id WHERE p.id = ?').bind(id).first<{ jpeg: string; record: { archived?: boolean } }>();
  if (!row || (row.record.archived && !canArchiveBan(session.role))) return json({ error: 'Photo not found' }, 404);
  return new Response(Buffer.from(row.jpeg, 'base64'), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
