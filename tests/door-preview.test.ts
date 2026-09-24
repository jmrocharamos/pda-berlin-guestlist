import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Node's strip-types runner loads the explicit TypeScript extension.
import { admissionCount, applyDoorAction, personState, sampleParties, undoDoorAction, doorRoles } from '../lib/door-preview.ts';
import type { DoorAction, DoorEvent, DoorRole, Person } from '../lib/door-preview';

let serial = 0;
function event(person: Person, action: DoorAction, role: DoorRole = 'Downstairs (Queue)'): DoorEvent {
  return { id: String(++serial), personId: person.id, action, role, staff: `Test ${role}`, note: 'Test note retained in history', at: new Date().toISOString() };
}
const author = { role: 'Admin' as DoorRole, staff: 'Test admin', at: new Date().toISOString() };

test('first check counts once across every role, duplicate taps are ignored', () => {
  let person = sampleParties()[0].people[0];
  for (const role of doorRoles) {
    person = applyDoorAction(person, event(person, 'check', role));
    assert.equal(personState(person).status, 'inside');
  }
  assert.equal(personState(person).checks.length, 7);
  const duplicate = applyDoorAction(person, event(person, 'check', 'Kasse'));
  assert.equal(duplicate.events.length, 7);
});

test('refusal blocks routine checks, reversal counts once, and undo restores refusal', () => {
  let person = sampleParties()[0].people[0];
  person = applyDoorAction(person, event(person, 'check'));
  person = applyDoorAction(person, event(person, 'check', 'Picker'));
  const refusal = event(person, 'refuse', 'Picker');
  person = applyDoorAction(person, refusal);
  assert.equal(personState(person).status, 'refused');
  assert.equal(applyDoorAction(person, event(person, 'check', 'Kasse')), person);
  assert.equal(applyDoorAction(person, event(person, 'refuse', 'Awareness')), person);
  const reversal = event(person, 'reverse', 'Kasse');
  person = applyDoorAction(person, reversal);
  assert.equal(personState(person).status, 'inside');
  assert.equal(applyDoorAction(person, event(person, 'reverse', 'Admin')), person);
  person = undoDoorAction(person, reversal.id, author);
  assert.equal(personState(person).status, 'refused');
  assert.equal(person.events.length, 4);
  assert.equal(person.events.find((item: DoorEvent) => item.id === refusal.id)?.note, 'Test note retained in history');
});

test('undoing one check preserves other checks; undoing the last removes admission', () => {
  let person = sampleParties()[0].people[0];
  const first = event(person, 'check'); const second = event(person, 'check', 'Picker');
  person = applyDoorAction(applyDoorAction(person, first), second);
  person = undoDoorAction(person, first.id, author);
  assert.equal(personState(person).status, 'inside');
  person = undoDoorAction(person, second.id, author);
  assert.equal(personState(person).status, 'waiting');
});

test('each plus-one has independent admission and notes do not change counts', () => {
  const parties = sampleParties();
  const party = parties[0];
  party.people[1] = applyDoorAction(party.people[1], event(party.people[1], 'check', 'Awareness'));
  party.people[0] = applyDoorAction(party.people[0], event(party.people[0], 'note'));
  party.people[2] = applyDoorAction(party.people[2], event(party.people[2], 'refuse'));
  assert.equal(admissionCount(parties), 1);
  assert.equal(personState(party.people[0]).status, 'waiting');
  assert.equal(personState(party.people[2]).status, 'refused');
});

test('refusal before admission has no decrement; undo preserves an immutable audit', () => {
  let person = sampleParties()[0].people[0];
  const refusal = event(person, 'refuse');
  person = applyDoorAction(person, refusal);
  person = undoDoorAction(person, refusal.id, author);
  assert.equal(personState(person).status, 'waiting');
  assert.equal(person.events[0].undoneBy?.staff, author.staff);
  const repeat = undoDoorAction(person, refusal.id, { ...author, staff: 'Different' });
  assert.equal(repeat.events[0].undoneBy?.staff, author.staff);
});
