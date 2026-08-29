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

test('self-applied branding is on track before the seven-day deadline', () => {
  const shippedAt = Date.UTC(2026, 0, 1);
  const listing = { shippedAt, brandingMode: 'self', brandingDueAt: shippedAt + 7 * 86400000, checkins: [], termMonths: 12 };
  assert.deepEqual(
    JSON.parse(JSON.stringify(statusAt(listing, shippedAt + 6 * 86400000))),
    { expected: 0, missed: 0, overdue: false, nonCompliant: false, firstDueAt: listing.brandingDueAt, firstOverdue: false },
  );
});

test('self-applied branding flags the first proof after seven days', () => {
  const shippedAt = Date.UTC(2026, 0, 1);
  const listing = { shippedAt, brandingMode: 'self', brandingDueAt: shippedAt + 7 * 86400000, checkins: [], termMonths: 12 };
  const result = statusAt(listing, listing.brandingDueAt + 1);
  assert.equal(result.expected, 1);
  assert.equal(result.missed, 1);
  assert.equal(result.overdue, true);
  assert.equal(result.firstOverdue, true);
});

test('monthly cadence continues from the first submitted check-in', () => {
  const shippedAt = Date.UTC(2026, 0, 1);
  const firstCheckin = shippedAt + 5 * 86400000;
  const listing = { shippedAt, brandingMode: 'self', brandingDueAt: shippedAt + 7 * 86400000, checkins: [{ date: firstCheckin }], termMonths: 12 };
  assert.equal(statusAt(listing, firstCheckin + 29 * 86400000).expected, 1);
  assert.equal(statusAt(listing, firstCheckin + 30 * 86400000).expected, 2);
}
);