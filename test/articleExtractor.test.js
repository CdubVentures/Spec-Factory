import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMainArticle } from '../src/features/indexing/extraction/articleExtractor.js';

test('article extractor: readability keeps article body and drops nav/footer noise', () => {
  const html = `
    <html>
      <head><title>OP1we Wireless Review</title></head>
      <body>
        <nav>Home | Deals | Login</nav>
        <article>
          <h1>Endgame Gear OP1we Wireless Review</h1>
          <p>The OP1we is a compact wireless mouse focused on low latency and competitive play.</p>
          <h2>Performance</h2>
          <p>Sensor performance remained stable during rapid flick tests and lift-off behavior was consistent.</p>
          <p>Weight measured at 58 grams on our scale and battery life landed around 95 hours in office use.</p>
        </article>
        <footer>Cookie settings | Privacy policy</footer>
      </body>
    </html>
  `;

  const extracted = extractMainArticle(html, {
    url: 'https://example.com/review/op1we',
    title: 'OP1we Wireless Review',
    minChars: 120,
    minScore: 20
  });

  assert.equal(extracted.method, 'readability');
  assert.ok(extracted.text.includes('Endgame Gear OP1we Wireless Review'));
  assert.ok(extracted.text.includes('Weight measured at 58 grams'));
  assert.ok(!extracted.text.toLowerCase().includes('cookie settings'));
  assert.ok(extracted.quality.score >= 20);
});

test('article extractor: uses heuristic fallback when disabled', () => {
  const html = '<html><body><main><p>Simple body text with model and weight details.</p></main></body></html>';
  const extracted = extractMainArticle(html, {
    enabled: false,
    minChars: 20,
    minScore: 1
  });
  assert.equal(extracted.method, 'heuristic_fallback');
  assert.equal(extracted.fallback_reason, 'disabled');
  assert.ok(extracted.text.includes('Simple body text'));
});

test('article extractor: falls back when readability output is weak and fallback scores higher', () => {
  const html = `
    <html>
      <body>
        <div>subscribe now subscribe now subscribe now</div>
        <div>privacy terms cookies</div>
        <div>weight: 61 g polling rate: 1000 hz sensor: paw3395 wireless 2.4ghz usb-c</div>
      </body>
    </html>
  `;
  const extracted = extractMainArticle(html, {
    minChars: 10,
    minScore: 5
  });
  assert.ok(['heuristic_fallback', 'readability'].includes(extracted.method));
  assert.ok(typeof extracted.quality.score === 'number');
  assert.ok(typeof extracted.quality.duplicate_sentence_ratio === 'number');
});

test('article extractor: policy mode prefer_fallback forces heuristic path', () => {
  const html = `
    <html>
      <head><title>Example Review</title></head>
      <body>
        <article>
          <h1>Example Review</h1>
          <p>This is long enough text to allow readability extraction in normal mode.</p>
          <p>Sensor and latency details are present.</p>
        </article>
      </body>
    </html>
  `;
  const extracted = extractMainArticle(html, {
    mode: 'prefer_fallback',
    minChars: 20,
    minScore: 1
  });
  assert.equal(extracted.method, 'heuristic_fallback');
  assert.equal(extracted.fallback_reason, 'policy_prefer_fallback');
});

test('article extractor: policy mode prefer_readability keeps readability output even if low quality', () => {
  const html = `
    <html>
      <body>
        <article><p>Short text.</p></article>
      </body>
    </html>
  `;
  const extracted = extractMainArticle(html, {
    mode: 'prefer_readability',
    minChars: 200,
    minScore: 80
  });
  assert.equal(extracted.method, 'readability');
  assert.equal(extracted.low_quality, true);
});

test('article extractor: oversized rendered pages bypass readability and use heuristic fallback', () => {
  const repeatedSection = '<section><p>Razer Viper V3 Pro weight 54 g polling rate 8000 Hz sensor Focus Pro 35K.</p></section>';
  const html = `<html><body><article><h1>Razer Viper V3 Pro</h1>${repeatedSection.repeat(7000)}</article></body></html>`;

  const extracted = extractMainArticle(html, {
    title: 'Razer Viper V3 Pro',
    minChars: 200,
    minScore: 20,
    maxReadabilityHtmlChars: 400_000
  });

  assert.equal(extracted.method, 'heuristic_fallback');
  assert.equal(extracted.fallback_reason, 'html_too_large_for_readability');
  assert.ok(extracted.text.includes('Razer Viper V3 Pro'));
  assert.ok(extracted.text.includes('polling rate 8000 Hz'));
});
