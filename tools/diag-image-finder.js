#!/usr/bin/env node
// WHY: Tests the product image finder concept. Takes CEF data from disk,
// sends it to LLM Lab with gpt-5.4-pro + web search, asks the model to
// find direct image URLs for each colorway and edition.
//
// Usage: node tools/test-image-finder.js [model]
//   model defaults to gpt-5.4-pro-xhigh

import fs from 'node:fs';
import path from 'node:path';

const model = process.argv[2] || 'gpt-5.4-pro-xhigh';

// ---------------------------------------------------------------------------
// Load CEF data
// ---------------------------------------------------------------------------

const cefPath = '.workspace/products/mouse-b794700f/color_edition.json';
const cef = JSON.parse(fs.readFileSync(cefPath, 'utf8'));
const lastRun = cef.runs[cef.runs.length - 1];
const response = lastRun.response;

const product = { brand: 'Corsair', model: 'M75 Wireless' };
const colors = response.colors || [];
const colorNames = response.color_names || {};
const editions = response.editions || {};
const knownUrls = (response.discovery_log?.urls_checked || []).slice(0, 10);

console.log(`Product: ${product.brand} ${product.model}`);
console.log(`Colors: ${colors.join(', ')}`);
console.log(`Editions: ${Object.keys(editions).join(', ') || '(none)'}`);
console.log(`Model: ${model}\n`);

// ---------------------------------------------------------------------------
// Build prompt
// ---------------------------------------------------------------------------

const editionLines = Object.entries(editions).map(([slug, ed]) =>
  `- ${slug}: "${ed.display_name}" (colors: ${ed.colors?.join(', ')})`
).join('\n');

const systemPrompt = `You are a product image researcher. Find the DIRECT image URL for each colorway and edition of the given product.

Product: ${product.brand} ${product.model}
Category: mouse
Preferred view: TOP-DOWN (bird's eye, showing the full shell color/design from above)

Known colorways:
${colors.map(c => `- ${c}${colorNames[c] ? ` ("${colorNames[c]}")` : ''}`).join('\n')}

Known editions:
${editionLines || '(none)'}

Known product page URLs (start here):
${knownUrls.map(u => `- ${u}`).join('\n')}

INSTRUCTIONS:
1. Visit the product pages above (and search for more if needed)
2. For EACH colorway and EACH edition, find the official product image
3. Prefer the TOP-DOWN view from the image carousel (not angled hero shots, not lifestyle photos)
4. Return the DIRECT image URL — the actual .jpg/.png/.webp CDN link, not the page URL
5. Minimum image width: 600px (check URL params like ?width= or image dimensions)
6. If Corsair uses Cloudinary or a CDN with size params, set width to at least 800

Return JSON:
{
  "images": {
    "<color-atom-or-edition-slug>": {
      "url": "https://direct-image-url...",
      "view": "top|front|side|angled",
      "width_hint": 800,
      "source_page": "https://page-where-found...",
      "notes": "optional notes"
    }
  },
  "missing": ["<items where no suitable image was found>"],
  "search_log": ["<searches performed>"]
}`;

const userMessage = JSON.stringify({
  brand: product.brand,
  model: product.model,
  colors,
  color_names: colorNames,
  editions,
});

// ---------------------------------------------------------------------------
// Call LLM Lab
// ---------------------------------------------------------------------------

console.log('Sending to LLM Lab...');
console.log(`System prompt: ${systemPrompt.length} chars`);
console.log(`User message: ${userMessage.length} chars\n`);

const t0 = Date.now();

try {
  const resp = await fetch('http://localhost:5001/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      request_options: {
        web_search: true,
        reasoning_effort: 'xhigh',
      },
      stream: true,
    }),
    signal: AbortSignal.timeout(900_000), // 15 min
  });

  const text = await resp.text();
  const dur = ((Date.now() - t0) / 1000).toFixed(1);

  if (!resp.ok) {
    console.log(`ERROR ${resp.status}: ${text.slice(0, 500)}`);
    process.exit(1);
  }

  // Extract content from SSE
  const parts = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const evt = JSON.parse(line.slice(6));
      const d = evt?.choices?.[0]?.delta?.content;
      if (d) parts.push(d);
    } catch { /* skip */ }
  }
  const content = parts.join('');

  console.log(`Duration: ${dur}s`);
  console.log(`Response: ${content.length} chars\n`);

  // Strip think tags if present
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Try to parse JSON
  let parsed = null;
  try { parsed = JSON.parse(cleaned); } catch {
    const m = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (m?.[1]) try { parsed = JSON.parse(m[1].trim()); } catch { /* */ }
  }
  if (!parsed) {
    // Try balanced brace extraction
    const idx = cleaned.indexOf('{');
    if (idx >= 0) {
      let depth = 0, inStr = false, esc = false;
      for (let i = idx; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) { try { parsed = JSON.parse(cleaned.slice(idx, i + 1)); } catch { } break; } }
      }
    }
  }

  if (parsed?.images) {
    console.log('=== IMAGES FOUND ===\n');
    for (const [key, img] of Object.entries(parsed.images)) {
      const label = colorNames[key] || editions[key]?.display_name || key;
      console.log(`  ${label} (${key})`);
      console.log(`    URL:  ${img.url}`);
      console.log(`    View: ${img.view || '?'} | Width: ${img.width_hint || '?'}px`);
      console.log(`    From: ${img.source_page || '?'}`);
      if (img.notes) console.log(`    Note: ${img.notes}`);
      console.log();
    }
    if (parsed.missing?.length) {
      console.log(`Missing: ${parsed.missing.join(', ')}`);
    }
    console.log(`Searches: ${parsed.search_log?.length || 0}`);
  } else {
    console.log('=== RAW RESPONSE (first 3000 chars) ===\n');
    console.log(cleaned.slice(0, 3000));
  }

} catch (err) {
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`ERROR after ${dur}s: ${err.message}`);
}
