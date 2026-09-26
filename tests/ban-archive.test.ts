import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Node's native test runner uses explicit TypeScript extensions.
import { canArchiveBan, changeBanArchive } from '../lib/ban-archive.ts';

test('only Admin and Manager can archive or restore', () => {
  for (const role of ['admin', 'manager']) assert.equal(canArchiveBan(role), true);
  for (const role of ['club-manager', 'kasse', 'picker', 'awareness', 'downstairs', '', 'unknown']) assert.equal(canArchiveBan(role), false);
});

test('archive and restore preserve photos, notes and an attributed history', () => {
  const record = { id: 'sample', name: 'Test person', photos: ['private-photo'], notes: [], staff: 'A', role: 'Admin' as const, at: 'before' };
  const actor = { staff: 'B', role: 'Manager' as const, at: 'now' };
  const archived = changeBanArchive(record, 'archive', actor);
  assert.equal(archived.archived, true);
  assert.deepEqual(archived.photos, record.photos);
  assert.deepEqual(archived.notes, record.notes);
  assert.equal(archived.archiveHistory?.[0].staff, 'B');
  assert.equal(changeBanArchive(archived, 'archive', actor), archived);
  const restored = changeBanArchive(archived, 'restore', actor);
  assert.equal(restored.archived, false);
  assert.deepEqual(restored.archiveHistory?.map((entry: { action: string }) => entry.action), ['archive', 'restore']);
  assert.equal('archived' in record, false);
});
