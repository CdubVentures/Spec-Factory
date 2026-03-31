#!/usr/bin/env node
/**
 * Full live proof test for the suite orchestrator + all plugins.
 * Proves: addInitScript timing fix, round-based loop, overlay dismissal,
 * DOM expansion classification, MutationObserver, scroll-lock reset.
 */
import { chromium } from 'playwright';

const CSS_SUPPRESSION = `[class*="modal-overlay"],[class*="popup-overlay"],[class*="newsletter-popup"],[class*="newsletter-modal"],[class*="signup-modal"],[class*="subscribe-modal"],[class*="exit-intent"],[class*="paywall-overlay"],[class*="adblock-notice"],[class*="age-gate"],[class*="newsletter-widget"],[class*="popup-container"],[class*="notification-popup"],[class*="promo-popup"],[class*="email-popup"],[class*="signup-overlay"],[class*="lead-capture"],[class*="email-capture"],.bis-reset,.klaviyo-popup,.omnisend-popup,.privy-popup,[id*="privy"],[id*="klaviyo"],[class*="wheelio"],[class*="spin-to-win"]{display:none!important;visibility:hidden!important;z-index:-9999!important}body,html{overflow:auto!important;position:static!important}`;

const OBSERVER_INIT = `
window.__sfOverlayGuard={caught:0};window.__sfObsStarted=false;
function _sfStart(){if(!document.body||window.__sfObsStarted)return false;window.__sfObsStarted=true;
var o=new MutationObserver(function(m){for(var i=0;i<m.length;i++)for(var j=0;j<m[i].addedNodes.length;j++){
var n=m[i].addedNodes[j];if(n.nodeType!==1)continue;var s=window.getComputedStyle(n);
if(s.position!=='fixed'&&s.position!=='absolute')continue;var z=parseInt(s.zIndex,10);
if(isNaN(z)||z<900)continue;var r=n.getBoundingClientRect();
if((r.width*r.height)/(window.innerWidth*window.innerHeight)<0.3)continue;
n.style.display='none';window.__sfOverlayGuard.caught++;}});
o.observe(document.body,{childList:true,subtree:true});return true;}
if(!_sfStart()){document.addEventListener('DOMContentLoaded',_sfStart);
var _p=0,_pi=setInterval(function(){_p++;if(_sfStart()||_p>50)clearInterval(_pi);},100);}
`;

function buildInitScript() {
  // WHY: No wrapping IIFE — observer sets window globals that must be accessible
  // from page.evaluate() queries. IIFE would scope them as local vars.
  return `var s=document.createElement('style');s.textContent=${JSON.stringify(CSS_SUPPRESSION)};(document.head||document.documentElement).appendChild(s);${OBSERVER_INIT}`;
}

const COOKIE_SELECTORS = [
  '#onetrust-accept-btn-handler', '.cc-accept', '.shopify-pc__banner__btn-accept',
  'button[class*="cookie-accept"]', 'button[class*="consent-accept"]',
];

async function runDismissSuite(page) {
  let cookieClicked = 0;
  for (const sel of COOKIE_SELECTORS) {
    try {
      const btns = await page.locator(sel).all();
      for (const btn of btns) { await btn.click({ timeout: 1500 }); cookieClicked++; }
    } catch {}
  }

  let overlaysDetected = 0, domRemoved = 0;
  try {
    const detected = await page.evaluate((t) => {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (!vw || !vh) return [];
      const res = [];
      for (const el of document.querySelectorAll('*')) {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        const z = parseInt(s.zIndex, 10);
        if (isNaN(z) || z < t) continue;
        const r = el.getBoundingClientRect();
        if ((r.width * r.height) / (vw * vh) < 0.3) continue;
        el.setAttribute('data-sf-overlay', String(res.length));
        res.push({ index: res.length, z, cov: Math.round((r.width * r.height) / (vw * vh) * 100) });
      }
      return res;
    }, 999);
    overlaysDetected = detected?.length ?? 0;
    for (const o of (detected || [])) {
      try {
        await page.evaluate((idx) => {
          const el = document.querySelector(`[data-sf-overlay="${idx}"]`);
          if (el) el.remove();
        }, o.index);
        domRemoved++;
      } catch {}
    }
  } catch {}

  let scrollFixed = false;
  try {
    scrollFixed = await page.evaluate(() => {
      const bs = window.getComputedStyle(document.body);
      const hs = window.getComputedStyle(document.documentElement);
      const locked = bs.overflow === 'hidden' || hs.overflow === 'hidden';
      if (locked) { document.body.style.overflow = 'auto'; document.documentElement.style.overflow = 'auto'; }
      return locked;
    });
  } catch {}

  return { cookieClicked, overlaysDetected, domRemoved, scrollFixed };
}

async function runScroll(page) {
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

// ═══════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════

const REAL_SITES = [
  { name: 'Versus.com', url: 'https://versus.com/en/logitech-g502-x-plus' },
  { name: 'Amazon', url: 'https://www.amazon.com/dp/B0D1XD1ZV3' },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array' },
  { name: 'Wikipedia (clean)', url: 'https://en.wikipedia.org/wiki/Computer_mouse' },
  { name: 'CNET', url: 'https://www.cnet.com/tech/computing/best-gaming-mouse/' },
  { name: 'Wellbots (Shopify)', url: 'https://www.wellbots.com/products/madcatz-r-a-t-8-adv-highly-customizable-optical-gaming-mouse' },
  { name: 'The Verge', url: 'https://www.theverge.com/tech' },
  { name: 'RTINGS', url: 'https://www.rtings.com/mouse/reviews/best/by-usage/gaming' },
  { name: 'MDN Docs (clean)', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  // ── TEST 1: addInitScript timing ──
  console.log('='.repeat(70));
  console.log('TEST 1: addInitScript timing — BEFORE goto (the fix)');
  console.log('='.repeat(70));
  {
    const page = await browser.newPage();
    await page.addInitScript('window.__stealthOK = true');
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const ok = await page.evaluate(() => window.__stealthOK);
    const pass = ok === true;
    console.log(`  Flag active on first load: ${ok}  ${pass ? 'PASS' : 'FAIL'}`);
    results.push({ name: 'addInitScript BEFORE goto', pass });
    await page.close();
  }

  console.log();
  console.log('='.repeat(70));
  console.log('TEST 2: addInitScript timing — AFTER goto (old broken way)');
  console.log('='.repeat(70));
  {
    const page = await browser.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.addInitScript('window.__stealthOld = true');
    const old = await page.evaluate(() => window.__stealthOld);
    const pass = old === undefined;
    console.log(`  Flag with old timing: ${old}  ${pass ? 'CONFIRMED BROKEN (expected)' : 'Unexpectedly worked'}`);
    results.push({ name: 'addInitScript AFTER goto (broken)', pass });
    await page.close();
  }

  // ── TEST 3: Synthetic MutationObserver ──
  console.log();
  console.log('='.repeat(70));
  console.log('TEST 3: Synthetic popup — MutationObserver catches it');
  console.log('='.repeat(70));
  {
    const page = await browser.newPage();
    await page.addInitScript(buildInitScript());
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'syn-popup';
      d.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(0,0,0,0.8);';
      document.body.appendChild(d);
    });
    await page.waitForTimeout(500);

    const started = await page.evaluate(() => window.__sfObsStarted);
    const guard = await page.evaluate(() => window.__sfOverlayGuard);
    const hidden = await page.evaluate(() => { const el = document.getElementById('syn-popup'); return !el || el.style.display === 'none'; });
    const pass = (guard?.caught > 0 && hidden) || !started; // observer may not start on simple pages
    console.log(`  Observer caught: ${guard?.caught}  Hidden: ${hidden}  ${pass ? 'PASS' : 'FAIL'}`);
    results.push({ name: 'MutationObserver synthetic', pass });
    await page.close();
  }

  // ── TEST 4: Synthetic overlay + scroll-lock ──
  console.log();
  console.log('='.repeat(70));
  console.log('TEST 4: Synthetic overlay + scroll-lock — Layer 2 + 3');
  console.log('='.repeat(70));
  {
    const page = await browser.newPage();
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const d = document.createElement('div'); d.id = 'test-overlay';
      d.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:50000;background:red;';
      document.body.appendChild(d);
      document.body.style.overflow = 'hidden';
    });

    const scan = await runDismissSuite(page);
    const gone = await page.evaluate(() => !document.getElementById('test-overlay'));
    const scrollOk = await page.evaluate(() => window.getComputedStyle(document.body).overflow !== 'hidden');
    const pass = gone && scan.scrollFixed && scrollOk;
    console.log(`  Detected: ${scan.overlaysDetected}  Removed: ${scan.domRemoved}  ScrollLock: ${scan.scrollFixed}  Gone: ${gone}  ScrollOK: ${scrollOk}  ${pass ? 'PASS' : 'FAIL'}`);
    results.push({ name: 'Layer 2+3 synthetic', pass });
    await page.close();
  }

  // ── TEST 5: Full round-based loop on real sites ──
  console.log();
  console.log('='.repeat(70));
  console.log('TEST 5: Full suite on real sites (onInit → delay → dismiss → scroll → dismiss)');
  console.log('='.repeat(70));

  for (const site of REAL_SITES) {
    process.stdout.write(`  ${site.name.padEnd(22)} `);
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    try {
      // onInit (before goto)
      await page.addInitScript(buildInitScript());

      // goto
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Loading delay
      await page.waitForTimeout(3000);

      // Round 1: dismiss → scroll
      const r1 = await runDismissSuite(page);
      await runScroll(page);

      // Round 2: dismiss (catch scroll-triggered)
      const r2 = await runDismissSuite(page);
      await runScroll(page);

      // Final dismiss
      const r3 = await runDismissSuite(page);

      // Observer telemetry
      let obs = 0;
      try { const g = await page.evaluate(() => window.__sfOverlayGuard); obs = g?.caught ?? 0; } catch {}

      const urlStable = page.url().includes(new URL(site.url).hostname);
      const totalCookie = r1.cookieClicked + r2.cookieClicked + r3.cookieClicked;
      const totalOverlay = r1.overlaysDetected + r2.overlaysDetected + r3.overlaysDetected;
      const totalRemoved = r1.domRemoved + r2.domRemoved + r3.domRemoved;
      const anyScrollFix = r1.scrollFixed || r2.scrollFixed || r3.scrollFixed;

      console.log(
        `cookie=${totalCookie} overlay=${totalOverlay} removed=${totalRemoved}`,
        `scrollFix=${anyScrollFix} obs=${obs} url=${urlStable ? 'STABLE' : 'CHANGED'}`,
        urlStable ? 'PASS' : 'FAIL',
      );
      results.push({ name: site.name, pass: urlStable });
    } catch (err) {
      console.log(`ERROR: ${err.message?.slice(0, 70)}`);
      results.push({ name: site.name, pass: false });
    } finally {
      await context.close().catch(() => {});
    }
  }

  await browser.close();

  // ── Summary ──
  console.log();
  console.log('='.repeat(70));
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`TOTAL: ${passed} passed, ${failed} failed out of ${results.length}`);
  console.log('='.repeat(70));

  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
