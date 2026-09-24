import type { Party, Person } from './door-preview';

export type DoorGuest = { id: number; name: string; guest_type: string; host: string; note?: string; allocation: number; checked_in: number; updated_at: string; door_people: Person[] | null; door_version: number };
export function guestParty(row: DoorGuest): Party {
  const people = Array.from({ length: Math.max(row.allocation, row.door_people?.length ?? 0) }, (_, index): Person => {
    const id = `${row.id}-${index}`;
    if (row.door_people?.[index]) return { ...row.door_people[index], label: index === 0 ? row.name : `+1 · Guest ${index}` };
    return { id, label: index === 0 ? row.name : `+1 · Guest ${index}`, events: !row.door_people && index < row.checked_in ? [{ id: `legacy-${id}`, personId: id, action: 'check', role: 'Admin', staff: 'Previous check-in', note: 'Carried over from the previous door system.', at: row.updated_at }] : [] };
  });
  return { id: String(row.id), name: row.name, group: row.guest_type, host: row.host, note: row.note, people };
}
