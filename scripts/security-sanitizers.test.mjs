import assert from 'node:assert/strict';
import test from 'node:test';
import { clean } from './fetch-giftcards-dept.mjs';

test('giftcard cleaner strips encoded markup before it can be rendered', () => {
  const payloads = [
    '&lt;img src=x onerror=alert(1)&gt;롯데',
    '&amp;lt;svg onload=alert(1)&amp;gt;신세계',
    '&#60;script&#62;alert(1)&#60;/script&#62;현대',
    '&#x3c;iframe src=javascript:alert(1)&#x3e;갤러리아',
  ];

  for (const payload of payloads) {
    const result = clean(payload);
    assert.doesNotMatch(result, /[<>]/);
    assert.doesNotMatch(result, /(?:img|svg|script|iframe)\s/i);
  }
});

test('giftcard cleaner bounds hostile entities and output length', () => {
  assert.doesNotThrow(() => clean('&#999999999999;롯데'));
  assert.ok(clean('가'.repeat(500)).length <= 160);
});
