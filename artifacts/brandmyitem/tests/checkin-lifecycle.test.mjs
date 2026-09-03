import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/function checkinStatus\(l\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(source, 'checkinStatus should exist in index.html');

function statusAt(listing, now) {
  const context = {
    Date: { now: () => now },
    termOf: (l) => [6, 12, 18].includes(l.termMonths) ? l.termMonths : 12,
  };
  const sandbox = { ...context, listing };
  vm.runInNewContext(`${source}; result = checkinStatus(listing)`, sandbox);
  return sandbox.result;
}

test('the first check-in is on track before the monthly deadline', () => {
  const shippedAt = Date.UTC(2026, 0, 1);
  const listing = { shippedAt, brandingMode: 'assisted', checkins: [], termMonths: 12 };
  assert.deepEqual(
    JSON.parse(JSON.stringify(statusAt(listing, shippedAt + 29 * 86400000))),
    { expected: 0, missed: 0, overdue: false, nonCompliant: false, firstDueAt: shippedAt + 30 * 86400000, firstOverdue: false },
  );
});

test('the first check-in becomes overdue after one month', () => {
  const shippedAt = Date.UTC(2026, 0, 1);
  const listing = { shippedAt, brandingMode: 'assisted', checkins: [], termMonths: 12 };
  const result = statusAt(listing, shippedAt + 30 * 86400000 + 1);
  assert.equal(result.expected, 1);
  assert.equal(result.missed, 1);
  assert.equal(result.overdue, true);
  assert.equal(result.firstOverdue, true);
});

test('monthly cadence continues from the first submitted check-in', () => {
  const shippedAt = Date.UTC(2026, 0, 1);
  const firstCheckin = shippedAt + 5 * 86400000;
  const listing = { shippedAt, brandingMode: 'assisted', checkins: [{ date: firstCheckin }], termMonths: 12 };
  assert.equal(statusAt(listing, firstCheckin + 29 * 86400000).expected, 1);
  assert.equal(statusAt(listing, firstCheckin + 30 * 86400000).expected, 2);
}
);