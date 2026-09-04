import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publicFile = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('legal policies include the required owner, make-good, check-in, and privacy clauses', () => {
  const legal = publicFile('legal.html');
  for (const phrase of ['small claims court', 'visible whenever', 'Normal wear is not a breach', 'file a police report and upload it', 'completed W-9 and one linked social account', 'exclusive remedy', 'chargeback', 'spot price × months remaining ÷ term months', 'stored encrypted', 'Stripe processes saved payment methods']) {
    assert.match(legal, new RegExp(phrase));
  }
  for (const forbidden of ['escrow', 'first sale', 'liquidated', 'charged at checkout']) {
    assert.doesNotMatch(legal.toLowerCase(), new RegExp(forbidden));
  }
});

test('support pages expose the required accessibility statement and contact form', () => {
  const accessibility = publicFile('accessibility.html');
  const contact = publicFile('contact.html');
  assert.match(accessibility, /WCAG 2\.1 AA/);
  assert.match(accessibility, /Report a barrier:.*support@brandmyitem\.com/);
  assert.match(accessibility, /Last reviewed:/);
  for (const address of ['support@brandmyitem.com', 'legal@brandmyitem.com', 'privacy@brandmyitem.com']) assert.match(contact, new RegExp(address));
  assert.match(contact, /fetch\('\/api\/contact'/);
});

test('metadata uses the relative PNG social image and the 404 document is branded', () => {
  for (const file of ['legal.html', 'accessibility.html', 'contact.html']) {
    const html = publicFile(file);
    assert.match(html, /property="og:image" content="\/og-default\.png"/);
    assert.match(html, /name="twitter:image" content="\/og-default\.png"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
  }
  const notFound = publicFile('404.html');
  assert.match(notFound, /BrandMyItem/);
  assert.match(notFound, /That page isn't here\./);
  assert.match(notFound, /Live items/);
});