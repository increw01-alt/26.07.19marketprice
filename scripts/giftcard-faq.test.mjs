import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GIFT_CARD_FAQ, GIFT_CARD_OFFICIAL_LINKS } from './giftcard-faq.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('giftcard FAQ HTML and FAQPage data stay in sync', async () => {
  const html = await readFile(path.join(root, 'giftcard.html'), 'utf8');
  const renderedQuestions = [...html.matchAll(/<details class="faq-item">\s*<summary>(.*?)<\/summary>/g)].map(
    (match) => match[1],
  );
  assert.equal(new Set(GIFT_CARD_FAQ.map((item) => item.question)).size, GIFT_CARD_FAQ.length);
  assert.deepEqual(renderedQuestions, GIFT_CARD_FAQ.map((item) => item.question));

  const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]),
  );
  const faqPage = jsonLdBlocks.find((block) => block['@type'] === 'FAQPage');
  assert.ok(faqPage, 'FAQPage structured data is missing');
  assert.equal(faqPage.mainEntity.length, GIFT_CARD_FAQ.length);
  assert.deepEqual(
    faqPage.mainEntity.map((item) => ({
      question: item.name,
      answer: item.acceptedAnswer.text,
    })),
    GIFT_CARD_FAQ.map((item) => ({
      question: item.question,
      answer: item.paragraphs.join(' '),
    })),
  );

  for (const { href } of GIFT_CARD_OFFICIAL_LINKS) {
    assert.match(href, /^https:\/\//);
    assert.ok(html.includes(href.replaceAll('&', '&amp;')), `official link is missing: ${href}`);
  }
});
