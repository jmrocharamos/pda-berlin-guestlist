// Shared pure, replayable rules for the live door workflow and isolated preview.
export const doorRoles = ['Downstairs (Queue)', 'Picker', 'Kasse', 'Awareness', 'Club Manager', 'Manager', 'Admin'] as const;
export type DoorRole = typeof doorRoles[number];
export type DoorAction = 'check' | 'refuse' | 'reverse' | 'note';
export type DoorEvent = { id: string; personId: string; action: DoorAction; role: DoorRole; staff: string; note: string; at: string; undoneBy?: { staff: string; role: DoorRole; at: string } };
export type Person = { id: string; label: string; events: DoorEvent[] };
export type Party = { id: string; name: string; group: string; host: string; note?: string; people: Person[] };
export type BanNote = { text: string; staff: string; role: DoorRole; at: string };
export type BanRecord = { id: string; name: string; photos: string[]; notes: BanNote[]; staff: string; role: DoorRole; at: string; version?: number };

export function personState(person: Person) {
  let status: 'waiting' | 'inside' | 'refused' = 'waiting';
  const checks: DoorEvent[] = [];
  for (const event of person.events) {
    if (event.undoneBy) continue;
    if (event.action === 'check' && status !== 'refused') { status = 'inside'; checks.push(event); }
    if (event.action === 'refuse') status = 'refused';
    if (event.action === 'reverse' && status === 'refused') { status = 'inside'; checks.push(event); }
  }
  return { status, checks, notes: person.events.filter((event) => event.note) };
}

export function applyDoorAction(person: Person, event: DoorEvent): Person {
  const current = personState(person);
  if (event.personId !== person.id || person.events.some((existing) => existing.id === event.id)) return person;
  if (event.action === 'check' && (current.status === 'refused' || current.checks.some((check) => check.role === event.role && check.staff === event.staff))) return person;
  if (event.action === 'refuse' && current.status === 'refused') return person;
  if (event.action === 'reverse' && current.status !== 'refused') return person;
  return { ...person, events: [...person.events, event] };
}

export function undoDoorAction(person: Person, id: string, by: NonNullable<DoorEvent['undoneBy']>): Person {
  return { ...person, events: person.events.map((event) => event.id === id && !event.undoneBy ? { ...event, undoneBy: by } : event) };
}

export function admissionCount(parties: Party[]) { return parties.reduce((sum, party) => sum + party.people.filter((person) => personState(person).status === 'inside').length, 0); }

export function sampleParties(): Party[] {
  return [
    { id: 'alex', name: 'Alex Rivera', group: 'Guestlist', host: 'PDA', people: [{ id: 'alex-0', label: 'Alex Rivera', events: [] }, { id: 'alex-1', label: '+1 · Guest 1', events: [] }, { id: 'alex-2', label: '+1 · Guest 2', events: [] }] },
    { id: 'noor', name: 'Noor Santos', group: 'SOLI', host: 'PDA', people: [{ id: 'noor-0', label: 'Noor Santos', events: [] }] },
    { id: 'charlie', name: 'Charlie Winter', group: 'SKIP', host: 'Artists', people: [{ id: 'charlie-0', label: 'Charlie Winter', events: [] }, { id: 'charlie-1', label: '+1 · Guest 1', events: [] }] },
    { id: 'jules', name: 'Jules Moon', group: 'Friends', host: 'PDA', people: [{ id: 'jules-0', label: 'Jules Moon', events: [] }] },
  ];
}
