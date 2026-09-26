import type { BanRecord, DoorRole } from './door-preview';

export function canArchiveBan(role: string) { return role === 'admin' || role === 'manager'; }
export function canDeleteBan(role: string, record: BanRecord) { return canArchiveBan(role) && record.archived === true; }

export function changeBanArchive(record: BanRecord, action: 'archive' | 'restore', actor: { staff: string; role: DoorRole; at: string }): BanRecord {
  const archived = action === 'archive';
  if (Boolean(record.archived) === archived) return record;
  return { ...record, archived, archiveHistory: [...(record.archiveHistory || []), { ...actor, action }] };
}
