import { ensureDatabase, getSession, json } from '../../../../db/runtime';

export async function GET(request: Request) {
  if (!await getSession(request)) return json({ error: 'Sign in required' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return json({ error: 'Photo not found' }, 404);
  const db = await ensureDatabase();
  const row = await db.prepare('SELECT jpeg FROM door_photos WHERE id = ?').bind(id).first<{ jpeg: string }>();
  if (!row) return json({ error: 'Photo not found' }, 404);
  return new Response(Buffer.from(row.jpeg, 'base64'), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
