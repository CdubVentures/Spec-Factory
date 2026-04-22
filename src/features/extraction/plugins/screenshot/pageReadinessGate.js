// WHY: Multi-signal pre-capture readiness gate. Decides whether the page has
// actually rendered meaningful content before we screenshot it. Uses multiple
// orthogonal signals (semantic landmark, substantial text, commerce markers,
// product imagery) to minimize both false-positives ("blank page looks ready")
// and false-negatives ("real page flagged as blank").
//
// Architecture: Layer 1 of the 3-layer quality gate (pre-capture). Layer 2 is
// the post-capture validator (screenshotValidator.js). Layer 3 is the off-line
// audit tool that manually re-fetches URLs and compares outputs.
//
// Flow:
//   1. waitForLoadState('networkidle', timeoutMs) — proves all XHR done
//   2. Evaluate signals in-browser (detectReadinessSignalsInBrowser)
//   3. If any signal passes → ready
//   4. Else: waitForSelector('main, article, [role=main]', secondChanceMs)
//   5. Re-evaluate signals
//   6. Return { ready, signals, durationMs, secondChanceUsed, reason }

// WHY: This function runs BOTH in Node (tests, with globalThis shimmed) AND
// in Playwright's browser context (via page.evaluate). Therefore it must use
// only browser globals (document, window) and no ESM imports.
export function detectReadinessSignalsInBrowser() {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) {
    return { ready: false, landmark: false, substantialText: false, commerce: false, productImage: false };
  }

  // Signal 1: semantic landmark element present
  const landmark = !!doc.querySelector('main, article, [role="main"]');

  // Signal 2: substantial body text (> 500 chars rendered)
  const bodyText = (doc.body && doc.body.innerText) || '';
  const substantialText = bodyText.length > 500;

  // Signal 3: commerce markers (price, buy button, in-stock)
  //   - Price regex matches common formats: $49.99, €79,99, 49.99 USD, £10
  //   - Button/text labels for commerce actions
  const priceRegex = /[$€£¥]\s?\d|\d\s*(?:USD|EUR|GBP|JPY|CAD|AUD)\b|\bUSD\s*\d/i;
  const commerceWordsRegex = /\badd to cart\b|\bbuy now\b|\bin stock\b|\bout of stock\b|\badd to bag\b/i;
  let commerce = priceRegex.test(bodyText) || commerceWordsRegex.test(bodyText);
  if (!commerce) {
    try {
      const buttons = doc.querySelectorAll('button, [role="button"], a.btn, a.button');
      for (const btn of buttons) {
        const label = (btn.textContent || btn.innerText || '').trim();
        if (commerceWordsRegex.test(label)) { commerce = true; break; }
      }
    } catch { /* selector unsupported in shim */ }
  }

  // Signal 4: product-sized image (>200×200)
  let productImage = false;
  try {
    const imgs = doc.images || doc.querySelectorAll('img') || [];
    for (const img of imgs) {
      const w = Number(img.naturalWidth) || Number(img.width) || 0;
      const h = Number(img.naturalHeight) || Number(img.height) || 0;
      if (w > 200 && h > 200) { productImage = true; break; }
    }
  } catch { /* images list unsupported */ }

  const ready = landmark || substantialText || commerce || productImage;
  return { ready, landmark, substantialText, commerce, productImage };
}

function emptySignals() {
  return { ready: false, landmark: false, substantialText: false, commerce: false, productImage: false };
}

export async function waitForPageReady(page, {
  timeoutMs = 3000,
  secondChanceMs = 3000,
  logger,
} = {}) {
  const start = Date.now();

  // Step 1: networkidle wait (tolerates timeout — may not fire on sites with
  // long-polling XHR; signals still run afterward).
  try {
    await page.waitForLoadState('networkidle', { timeout: timeoutMs });
  } catch { /* timeout — proceed to signal check anyway */ }

  // Step 2: first-pass signal evaluation
  let signals = emptySignals();
  try {
    const raw = await page.evaluate(detectReadinessSignalsInBrowser);
    if (raw && typeof raw === 'object') signals = { ...emptySignals(), ...raw };
  } catch {
    // Swallow — treat as blank
  }

  if (signals.ready) {
    return {
      ready: true,
      signals,
      durationMs: Date.now() - start,
      secondChanceUsed: false,
      reason: 'first_pass',
    };
  }

  // Step 3: second-chance wait — explicitly wait for landmark OR give up
  const url = typeof page.url === 'function' ? page.url() : '';
  let secondChanceResolved = false;
  try {
    await page.waitForSelector('main, article, [role="main"]', { timeout: secondChanceMs });
    secondChanceResolved = true;
  } catch { /* no landmark appeared in second-chance window */ }

  // Step 4: re-evaluate signals
  try {
    const raw = await page.evaluate(detectReadinessSignalsInBrowser);
    if (raw && typeof raw === 'object') signals = { ...emptySignals(), ...raw };
  } catch { /* keep previous signals */ }

  const durationMs = Date.now() - start;

  if (signals.ready) {
    logger?.info?.('page_readiness_second_chance', {
      url,
      resolved: true,
      duration_ms: durationMs,
      signals,
    });
    return {
      ready: true,
      signals,
      durationMs,
      secondChanceUsed: true,
      reason: 'second_chance',
    };
  }

  logger?.info?.('page_readiness_failed', {
    url,
    duration_ms: durationMs,
    second_chance_waitfor_resolved: secondChanceResolved,
    signals,
  });

  return {
    ready: false,
    signals,
    durationMs,
    secondChanceUsed: true,
    reason: 'all_signals_failed',
  };
}
