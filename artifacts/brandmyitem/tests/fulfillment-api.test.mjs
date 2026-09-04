import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('campaigns use draft, bound W-9 intent, then publish', () => {
  assert.match(html, /fetch\('\/api\/campaign-drafts'/);
  assert.match(html, /\/api\/campaign-drafts\/'\+encodeURIComponent\(draft\.id\)\+'\/w9\/request-url/);
  assert.match(html, /'\/w9\/'\+encodeURIComponent\(intentId\)\+'\/finalize'/);
  assert.match(html, /\/api\/campaign-drafts\/'\+encodeURIComponent\(draft\.id\)\+'\/publish/);
  assert.match(html, /w9IntentId:w9IntentId/);
  assert.doesNotMatch(html, /fetch\('\/api\/campaigns',\{\s*method:'POST'/);
});

test('sponsor reservation binds its finalized logo intent into checkout', () => {
  assert.match(html, /fetch\('\/api\/sponsor-reservation-drafts'/);
  assert.match(html, /\/logo\/request-url/);
  assert.match(html, /reservationDraftId:reservationDraft\.id,logoIntentId:logoIntent\.id/);
  assert.doesNotMatch(html, /logoObjectPath:logoObjectPath/);
});

test('production proof direction and check-in intents follow contract roles', () => {
  assert.match(html, /\/api\/operator\/campaigns\/'\+encodeURIComponent\(CUR\.id\)\+'\/placement-orders\//);
  assert.match(html, /\/api\/operator\/campaigns\/'\+encodeURIComponent\(CUR\.id\)\+'\/proofs/);
  assert.match(html, /placementOrderId:claim\.stripeOrderId,intentId:proofIntent\.id/);
  assert.match(html, /fetch\('\/api\/campaigns\/'\+encodeURIComponent\(CUR\.id\)\+'\/proofs'/);
  assert.match(html, /placementOrderId:claim\.stripeOrderId,revision:claim\.proof\.revision/);
  assert.match(html, /body\.photoIntentId=uploaded\.id/);
  assert.match(html, /photoIntentId:checkinIntent\.id/);
});

test('generic signing is absent and delivery starts check-ins', () => {
  assert.doesNotMatch(html, /\/api\/storage\/uploads\/request-url/);
  assert.match(html, /\/api\/operator\/campaigns\/'\+encodeURIComponent\(CUR\.id\)\+'\/delivery/);
  assert.match(html, /CUR\.checkinStatus=delivery\.checkinStatus/);
  assert.match(html, /Authorization:'Bearer '\+token\.value\.trim\(\)/);
  assert.match(html, /if\(isDemoListing\(CUR\)\)/);
  assert.match(html, /if\(!isDemoListing\(l\)\)/);
});