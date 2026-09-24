import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Node strip-types runner uses explicit extensions.
import { guestParty } from '../lib/door-live.ts';
// @ts-ignore Node strip-types runner uses explicit extensions.
import { admissionCount } from '../lib/door-preview.ts';
// @ts-ignore Node strip-types runner uses explicit extensions.
import { staffRoles } from '../lib/staff-roles.ts';
test('legacy guests preserve admission totals and imported notes', () => {
  const party = guestParty({ id: 8, name: 'Sample +2', guest_type: 'Artists', host: 'PDA', note: 'Existing note', allocation: 3, checked_in: 2, updated_at: '2026-09-24T12:00:00Z', door_people: null, door_version: 0 });
  assert.equal(admissionCount([party]), 2);
  assert.equal(party.people.length, 3);
  assert.equal(party.note, 'Existing note');
  assert.equal(party.people[0].events[0].staff, 'Previous check-in');
});
test('all new roles can check and count with existing credential groups', () => {
  assert.equal(Object.hasOwn(staffRoles, 'bouncer'), false);
  for (const role of Object.values(staffRoles)) {
    assert.ok(role.permissions.includes('check'));
    assert.ok(role.permissions.includes('counter'));
  }
  assert.equal(staffRoles.manager.credentialRole, 'admin');
  assert.equal(staffRoles.downstairs.credentialRole, 'bouncer');
  assert.equal(staffRoles.picker.credentialRole, 'bouncer');
  assert.equal(staffRoles.awareness.credentialRole, 'bouncer');
});
