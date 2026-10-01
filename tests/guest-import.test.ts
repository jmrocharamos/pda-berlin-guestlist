import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-ignore Node's strip-types runner loads the explicit TypeScript extension.
import { guestsFromLines } from '../lib/guest-import.ts';

test('pasted names become guests in one selected group and keep plus allocations', () => {
  const guests = guestsFromLines('Ana\nMaria\n• Rosario + 1\n\n', 'Friends');
  assert.deepEqual(guests.map(({ name, type, allocation }) => ({ name, type, allocation })), [
    { name: 'Ana', type: 'Friends', allocation: 1 },
    { name: 'Maria', type: 'Friends', allocation: 1 },
    { name: 'Rosario + 1', type: 'Friends', allocation: 2 },
  ]);
});
