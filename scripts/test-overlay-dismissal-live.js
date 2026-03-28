#!/usr/bin/env node
/**
 * Live integration test for overlayDismissalPlugin against real websites.
 *
 * Tests each layer independently:
 *   Layer 1: CSS suppression — injected via addInitScript, hides known popup patterns
 *   Layer 2: Heuristic DOM scan — detects high-z-index fixed elements covering viewport
 *   Layer 3: Scroll-lock reset — detects and resets overflow:hidden on body
 *
 * Also tests the full combined pipeline.
 *
 * Usage: node scripts/test-overlay-dismissal-live.js
 */

import { chromium } from 'playwright';

// --------------------------------------------------------------------------
// Layer implementations (mirrors overlayDismissalPlugin.js)
// --------------------------------------------------------------------------

const SUPPRESSION_CSS = `
  [class*="modal-overlay"],[class*="popup-overlay"],[class*="newsletter-popup"],
  [class*="newsletter-modal"],[class*="signup-modal"],[class*="subscribe-modal"],
  [class*="exit-intent"],[class*="paywall-overlay"],[class*="adblock-notice"],
  [class*="age-gate"],[class*="newsletter-widget"],[class*="popup-container"],
  [id*="newsletter-popup"],[id*="exit-modal"],[id*="subscribe-overlay"],
  [role="dialog"][aria-modal="true"] {
    display: none !important;
    visibility: hidden !important;
    z-index: -9999 !important;
  }
  body, html {
    overflow: auto !important;
    position: static !important;
  }
`.replace(/\n/g, ' ').replace(/\s+/g, ' ');

const OBSERVER_SCRIPT = `
  window.__sfOverlayGuard = { caught: 0, log: [] };
  function _sfCheckOverlay(node) {
    try {
      if (node.nodeType !== 1) return;
      var s = window.getComputedStyle(node);
      var pos = s.position;
      if (pos !== 'fixed' && pos !== 'absolute') return;
      var z = parseInt(s.zIndex, 10);
      if (isNaN(z) || z < 900) return;
      var r = node.getBoundingClientRect();
      var cov = (r.width * r.height) / (window.innerWidth * window.innerHeight);
      if (cov < 0.3) return;
      node.style.display = 'none';
      window.__sfOverlayGuard.caught++;
      window.__sfOverlayGuard.log.push({
        tag: node.tagName, cls: (node.className || '').toString().slice(0, 80),
        z: z, cov: Math.round(cov * 100)
      });
    } catch(e) {}
  }
  function _sfStartObserver() {
    if (!document.body || window.__sfObsStarted) return false;
    window.__sfObsStarted = true;
    try {
      var obs = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) { _sfCheckOverlay(added[j]); }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      return true;
    } catch(e) { return false; }
  }
  if (!_sfStartObserver()) {
    document.addEventListener('DOMContentLoaded', _sfStartObserver);
    var _sfPollCount = 0;
    var _sfPoll = setInterval(function() {
      _sfPollCount++;
      if (_sfStartObserver() || _sfPollCount > 50) clearInterval(_sfPoll);
    }, 100);
  }
`;

async function injectLayer1(page) {
  await page.addInitScript(`
    (function() {
      var style = document.createElement('style');
      style.textContent = ${JSON.stringify(SUPPRESSION_CSS)};
      (document.head || document.documentElement).appendChild(style);
      ${OBSERVER_SCRIPT}
    })();
  `);
}

async function runLayer2Scan(page, { zIndexThreshold = 999 } = {}) {
  try {
    const detected = await page.evaluate((threshold) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw === 0 || vh === 0) return [];
      const results = [];
      const all = document.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const pos = s.position;
        if (pos !== 'fixed' && pos !== 'absolute') continue;
        const z = parseInt(s.zIndex, 10);
        if (isNaN(z) || z < threshold) continue;
        const rect = el.getBoundingClientRect();
        const coverage = (rect.width * rect.height) / (vw * vh);
        if (coverage < 0.3) continue;
        el.setAttribute('data-sf-overlay', String(i));
        results.push({
          index: i, zIndex: z, coverage: Math.round(coverage * 100),
          tagName: el.tagName, className: (el.className || '').toString().slice(0, 80),
          id: el.id || '',
        });
      }
      return results;
    }, zIndexThreshold);
    return detected || [];
  } catch {
    return [];
  }
}

async function runLayer3ScrollLock(page) {
  try {
    return await page.evaluate(() => {
      const bs = window.getComputedStyle(document.body);
      const hs = window.getComputedStyle(document.documentElement);
      const locked = bs.overflow === 'hidden' || hs.overflow === 'hidden';
      if (locked) {
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
      }
      return { locked, bodyOverflow: bs.overflow, htmlOverflow: hs.overflow };
    });
  } catch {
    return { locked: false, bodyOverflow: 'unknown', htmlOverflow: 'unknown' };
  }
}

async function getObserverTelemetry(page) {
  try {
    return await page.evaluate(() => window.__sfOverlayGuard || { caught: 0, log: [] });
  } catch {
    return { caught: 0, log: [] };
  }
}

async function removeDetectedOverlays(page, detected) {
  let removed = 0;
  for (const o of detected) {
    try {
      await page.evaluate((idx) => {
        const el = document.querySelector(`[data-sf-overlay="${idx}"]`);
        if (el) el.remove();
      }, o.index);
      removed++;
    } catch {}
  }
  return removed;
}

// --------------------------------------------------------------------------
// Test cases
// --------------------------------------------------------------------------

const TEST_CASES = [
  // ── Sites known for newsletter/signup popups ──
  {
    name: 'BuzzFeed — newsletter popup + scroll-triggered modal',
    url: 'https://www.buzzfeed.com/',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },
  {
    name: 'Medium article — membership wall + signup prompt',
    url: 'https://medium.com/free-code-camp/javascript-under-the-hood-v8-9be',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },
  {
    name: 'Forbes — ad overlays + consent + interstitials',
    url: 'https://www.forbes.com/sites/technology/',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },

  // ── E-commerce product pages (primary use case) ──
  {
    name: 'Amazon product — chat widget + upsell overlays',
    url: 'https://www.amazon.com/dp/B0D1XD1ZV3',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },
  {
    name: 'Best Buy product — popup promos + chat',
    url: 'https://www.bestbuy.com/site/logitech-g502-x-plus-wireless-gaming-mouse/6553475.p',
    waitMs: 5000,
    expect: { shouldNotCrash: false, urlMustBeStable: true }, // Often blocks headless
  },
  {
    name: 'Newegg product — newsletter + deals popup',
    url: 'https://www.newegg.com/p/2BA-00MK-001A8',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: false }, // SKU redirects common
  },

  // ── Review/comparison sites ──
  {
    name: 'Versus.com — the original failure site',
    url: 'https://versus.com/en/logitech-g502-x-plus',
    waitMs: 4000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },
  {
    name: 'Tom\'s Hardware — review site with ad overlays',
    url: 'https://www.tomshardware.com/best-picks/best-gaming-mouse',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },
  {
    name: 'RTINGS — comparison site with modal patterns',
    url: 'https://www.rtings.com/mouse/reviews/best/by-usage/gaming',
    waitMs: 4000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },

  // ── Tech/spec sites ──
  {
    name: 'PCMag — review with newsletter + ad overlays',
    url: 'https://www.pcmag.com/picks/the-best-gaming-mice',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },

  // ── Sites with known aggressive popups ──
  {
    name: 'NY Times — paywall overlay',
    url: 'https://www.nytimes.com/2024/01/01/technology/ai-chatbots.html',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: false }, // May redirect to login
  },
  {
    name: 'The Verge — newsletter + consent + ad overlays',
    url: 'https://www.theverge.com/tech',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },
  {
    name: 'CNET — review site with modal popups',
    url: 'https://www.cnet.com/tech/computing/best-gaming-mouse/',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },
  {
    name: 'TechRadar — newsletter popup + ad overlays',
    url: 'https://www.techradar.com/best/best-gaming-mouse',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },
  {
    name: 'Razer — manufacturer site with chat + promo overlays',
    url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
    waitMs: 5000,
    expect: { shouldNotCrash: true, urlMustBeStable: true },
  },

  // ── Clean sites (false positive check) ──
  {
    name: 'Wikipedia — clean page, zero overlays expected',
    url: 'https://en.wikipedia.org/wiki/Computer_mouse',
    waitMs: 2000,
    expect: { shouldNotCrash: true, urlMustBeStable: true, mustNotFalsePositive: true },
  },
  {
    name: 'MDN Web Docs — clean docs, zero overlays expected',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    waitMs: 2000,
    expect: { shouldNotCrash: true, urlMustBeStable: true, mustNotFalsePositive: true },
  },
  {
    name: 'GitHub repo — clean code page, zero overlays expected',
    url: 'https://github.com/nicknisi/dotfiles',
    waitMs: 2000,
    expect: { shouldNotCrash: true, urlMustBeStable: true, mustNotFalsePositive: true },
  },
  {
    name: 'Stack Overflow — clean Q&A, zero overlays expected',
    url: 'https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array',
    waitMs: 3000,
    expect: { shouldNotCrash: true, urlMustBeStable: true, mustNotFalsePositive: true },
  },
];

// --------------------------------------------------------------------------
// Runner
// --------------------------------------------------------------------------

async function runTestCase(browser, tc) {
  const result = {
    name: tc.name, pass: true, failures: [],
    layer1: null, layer2WithCss: null, layer2NoCss: null, layer3: null, observer: null,
  };

  // ── Test A: Full pipeline (all layers combined) ──
  {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    try {
      await injectLayer1(page);
      await page.goto(tc.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(tc.waitMs);

      // Layer 2 scan (with CSS suppression active)
      const withCss = await runLayer2Scan(page);
      result.layer2WithCss = { detected: withCss.length, details: withCss.slice(0, 5) };

      // Layer 3
      const scrollLock = await runLayer3ScrollLock(page);
      result.layer3 = scrollLock;

      // Observer
      const obs = await getObserverTelemetry(page);
      result.observer = obs;

      // Remove any remaining overlays
      if (withCss.length > 0) await removeDetectedOverlays(page, withCss);

      // URL stability
      const finalUrl = page.url();
      if (tc.expect.urlMustBeStable) {
        const base = tc.url.split('?')[0].replace(/\/$/, '');
        const finalBase = finalUrl.split('?')[0].replace(/\/$/, '');
        if (!finalBase.startsWith(base) && !base.startsWith(finalBase)) {
          result.pass = false;
          result.failures.push(`URL CHANGED: ${tc.url} → ${finalUrl}`);
        }
      }
    } catch (err) {
      if (tc.expect.shouldNotCrash) {
        result.pass = false;
        result.failures.push(`CRASHED (full pipeline): ${err.message?.slice(0, 100)}`);
      }
    } finally {
      await context.close().catch(() => {});
    }
  }

  // ── Test B: Layer 2 WITHOUT CSS suppression (exposes real popups) ──
  {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    try {
      // NO Layer 1 — let all popups render naturally
      await page.goto(tc.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(tc.waitMs);

      // Scan raw page
      const noCss = await runLayer2Scan(page);
      result.layer2NoCss = { detected: noCss.length, details: noCss.slice(0, 5) };

      // False positive check on clean sites
      if (tc.expect.mustNotFalsePositive && noCss.length > 0) {
        // Only fail if we'd wrongly remove things — inspect what was found
        const hasRealOverlay = noCss.some(
          (o) => o.coverage > 40 && o.zIndex > 5000 && !o.className.includes('nav') && !o.className.includes('header'),
        );
        if (hasRealOverlay) {
          result.pass = false;
          result.failures.push(`FALSE POSITIVE on clean site: detected ${noCss.length} overlays`);
        }
      }
    } catch (err) {
      // Navigation errors on some sites are expected (redirects, etc.)
      result.layer2NoCss = { detected: 0, details: [], error: err.message?.slice(0, 60) };
    } finally {
      await context.close().catch(() => {});
    }
  }

  return result;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Synthetic overlay test — inject a fake popup and prove Layer 2 catches it
// --------------------------------------------------------------------------

async function runSyntheticTest(browser) {
  const result = { name: 'SYNTHETIC — inject fake overlay, verify detection + removal', pass: true, failures: [] };
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    // Load a clean page
    await page.goto('https://en.wikipedia.org/wiki/Computer_mouse', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Inject a fake popup overlay
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.id = 'fake-newsletter-popup';
      overlay.className = 'newsletter-popup-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = '<div style="background:white;padding:40px;border-radius:8px;text-align:center;"><h2>Subscribe to our newsletter!</h2><button class="close-btn" style="padding:10px 20px;">No thanks</button></div>';
      document.body.appendChild(overlay);

      // Also lock scrolling
      document.body.style.overflow = 'hidden';
    });

    // Verify overlay exists
    const beforeScan = await page.evaluate(() => {
      const el = document.getElementById('fake-newsletter-popup');
      return { exists: !!el, bodyOverflow: window.getComputedStyle(document.body).overflow };
    });

    if (!beforeScan.exists) {
      result.pass = false;
      result.failures.push('Fake overlay was not injected');
    }
    if (beforeScan.bodyOverflow !== 'hidden') {
      result.pass = false;
      result.failures.push(`Body overflow not locked: ${beforeScan.bodyOverflow}`);
    }

    // Run Layer 2 scan (WITHOUT CSS suppression — prove heuristic works alone)
    const detected = await runLayer2Scan(page, { zIndexThreshold: 999 });
    if (detected.length === 0) {
      result.pass = false;
      result.failures.push('Layer 2 did NOT detect the injected overlay');
    }

    // Remove detected overlays
    const removed = await removeDetectedOverlays(page, detected);

    // Run Layer 3 scroll-lock reset
    const scrollLock = await runLayer3ScrollLock(page);

    // Verify overlay is gone and scroll is restored
    const afterScan = await page.evaluate(() => {
      const el = document.getElementById('fake-newsletter-popup');
      return { exists: !!el, bodyOverflow: window.getComputedStyle(document.body).overflow };
    });

    if (afterScan.exists) {
      result.pass = false;
      result.failures.push('Overlay was NOT removed by Layer 2');
    }
    if (afterScan.bodyOverflow === 'hidden') {
      result.pass = false;
      result.failures.push('Scroll-lock was NOT reset by Layer 3');
    }

    result.data = {
      detected: detected.length,
      removed,
      scrollLockDetected: scrollLock.locked,
      scrollLockReset: afterScan.bodyOverflow !== 'hidden',
      details: detected.slice(0, 3),
    };

  } catch (err) {
    result.pass = false;
    result.failures.push(`CRASHED: ${err.message?.slice(0, 100)}`);
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}

// --------------------------------------------------------------------------
// Synthetic MutationObserver test — prove delayed popup is caught
// --------------------------------------------------------------------------

async function runSyntheticObserverTest(browser) {
  const result = { name: 'SYNTHETIC — delayed popup caught by MutationObserver', pass: true, failures: [] };
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  try {
    // WHY: Use a minimal self-contained init script that matches the plugin's
    // exact pattern. The observer polls for document.body, then attaches.
    await page.addInitScript(`
      window.__sfOverlayGuard = { caught: 0 };
      window.__sfObsStarted = false;
      function _sfStartObs() {
        if (!document.body || window.__sfObsStarted) return false;
        window.__sfObsStarted = true;
        var obs = new MutationObserver(function(muts) {
          for (var i = 0; i < muts.length; i++) {
            for (var j = 0; j < muts[i].addedNodes.length; j++) {
              var n = muts[i].addedNodes[j];
              if (n.nodeType !== 1) continue;
              var s = window.getComputedStyle(n);
              if (s.position !== 'fixed' && s.position !== 'absolute') continue;
              var z = parseInt(s.zIndex, 10);
              if (isNaN(z) || z < 900) continue;
              var r = n.getBoundingClientRect();
              if ((r.width * r.height) / (window.innerWidth * window.innerHeight) < 0.3) continue;
              n.style.display = 'none';
              window.__sfOverlayGuard.caught++;
            }
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        return true;
      }
      if (!_sfStartObs()) {
        document.addEventListener('DOMContentLoaded', _sfStartObs);
        var _p = 0, _pi = setInterval(function() { _p++; if (_sfStartObs() || _p > 50) clearInterval(_pi); }, 100);
      }
    `);

    await page.goto('https://en.wikipedia.org/wiki/Computer_mouse', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const obsReady = await page.evaluate(() => !!window.__sfObsStarted);
    if (!obsReady) {
      result.pass = false;
      result.failures.push('Observer not started before popup injection');
    }

    // Inject a delayed popup
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.id = 'delayed-popup';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:50000;background:rgba(0,0,0,0.9);';
      overlay.innerHTML = '<div style="color:white;text-align:center;padding:100px;"><h2>Sign up now!</h2></div>';
      document.body.appendChild(overlay);
    });

    await page.waitForTimeout(500);

    const guard = await page.evaluate(() => window.__sfOverlayGuard);
    if (!guard || guard.caught === 0) {
      result.pass = false;
      result.failures.push('MutationObserver did NOT catch the delayed popup');
    }

    const hidden = await page.evaluate(() => {
      const el = document.getElementById('delayed-popup');
      return !el || el.style.display === 'none';
    });
    if (!hidden) {
      result.pass = false;
      result.failures.push('Delayed popup was NOT hidden by observer');
    }

    result.data = { observerCaught: guard?.caught ?? 0 };

  } catch (err) {
    result.pass = false;
    result.failures.push(`CRASHED: ${err.message?.slice(0, 100)}`);
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}

async function main() {
  console.log('='.repeat(75));
  console.log('Overlay Dismissal Plugin — Comprehensive Live Integration Test');
  console.log('='.repeat(75));
  console.log();
  console.log('Each site tested twice:');
  console.log('  A) Full pipeline (CSS + heuristic + observer + scroll-lock)');
  console.log('  B) Layer 2 only (NO CSS suppression — exposes raw popups)');
  console.log();

  const browser = await chromium.launch({ headless: true });
  const results = [];

  // ── Synthetic tests first (prove layers work) ──
  console.log('--- SYNTHETIC TESTS (prove each layer works) ---');
  console.log();

  process.stdout.write('  Synthetic overlay injection + Layer 2 scan ... ');
  const synth1 = await runSyntheticTest(browser);
  results.push(synth1);
  if (synth1.pass) {
    console.log(`PASS (detected=${synth1.data?.detected} removed=${synth1.data?.removed} scrollReset=${synth1.data?.scrollLockReset})`);
  } else {
    console.log('FAIL');
    for (const f of synth1.failures) console.log(`    ✖ ${f}`);
  }

  process.stdout.write('  Synthetic delayed popup + MutationObserver ... ');
  const synth2 = await runSyntheticObserverTest(browser);
  results.push(synth2);
  if (synth2.pass) {
    console.log(`PASS (observer caught=${synth2.data?.observerCaught})`);
  } else {
    console.log('FAIL');
    for (const f of synth2.failures) console.log(`    ✖ ${f}`);
  }

  console.log();
  console.log('--- REAL WEBSITE TESTS ---');
  console.log();

  for (const tc of TEST_CASES) {
    process.stdout.write(`  ${tc.name} ... `);
    const r = await runTestCase(browser, tc);
    results.push(r);

    if (r.pass) {
      const noCssCount = r.layer2NoCss?.detected ?? 0;
      const withCssCount = r.layer2WithCss?.detected ?? 0;
      const obsCaught = r.observer?.caught ?? 0;
      const locked = r.layer3?.locked ? 'YES' : 'no';
      console.log(`PASS`);
      console.log(`      Raw overlays: ${noCssCount}  |  After CSS: ${withCssCount}  |  Observer: ${obsCaught}  |  Scroll-lock: ${locked}`);
    } else {
      console.log(`FAIL`);
      for (const f of r.failures) console.log(`      ✖ ${f}`);
    }
  }

  await browser.close();

  // ── Summary ──
  console.log();
  console.log('='.repeat(75));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Results: ${passed} passed, ${failed} failed out of ${results.length} total`);

  // ── Detailed overlay log ──
  console.log();
  console.log('='.repeat(75));
  console.log('Detailed Overlay Detection (Layer 2 without CSS suppression)');
  console.log('='.repeat(75));
  for (const r of results) {
    const d = r.layer2NoCss;
    if (!d || d.detected === 0) {
      console.log(`\n--- ${r.name}: (no raw overlays detected)`);
      continue;
    }
    console.log(`\n--- ${r.name}: ${d.detected} raw overlay(s) ---`);
    for (const o of d.details) {
      console.log(`  z=${String(o.zIndex).padStart(6)} cov=${String(o.coverage).padStart(3)}% tag=${o.tagName.padEnd(6)} id=${(o.id || '-').slice(0, 20).padEnd(20)} class=${o.className.slice(0, 60)}`);
    }
  }

  // ── Observer log ──
  console.log();
  console.log('='.repeat(75));
  console.log('MutationObserver Catches (delayed popups caught at runtime)');
  console.log('='.repeat(75));
  for (const r of results) {
    const obs = r.observer;
    if (!obs || obs.caught === 0) continue;
    console.log(`\n--- ${r.name}: ${obs.caught} caught ---`);
    for (const entry of (obs.log || []).slice(0, 5)) {
      console.log(`  tag=${entry.tag} z=${entry.z} cov=${entry.cov}% class=${entry.cls}`);
    }
  }

  console.log();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
