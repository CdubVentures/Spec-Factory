#!/usr/bin/env node
/**
 * 50-site audit — tests cookie consent + overlay dismissal + DOM expansion
 * across retailers, review sites, manufacturers, and forums.
 * Reports: what popups exist, what we caught, what we missed.
 */
import { chromium } from 'playwright';

const COOKIE_SELECTORS = [
  '#onetrust-accept-btn-handler', '.cc-accept', '.cc-allow',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '[id*="cookie"] button[class*="accept"]', '.cmp-accept',
  '.shopify-pc__banner__btn-accept', '#shopify-pc__banner button[class*="accept"]',
  '.js-cookie-accept', '[data-cookie-accept]',
  'button[class*="cookie-accept"]', 'button[class*="consent-accept"]',
  '#cookie-policy-info .btn-ok', 'button[class*="btn-read-ck"]',
  'button[class*="accept-all"]', 'button[class*="acceptAll"]',
  '[id*="cookir"] button', '[id*="cookie-policy"] button', '[id*="cookiePolicy"] button',
  '[class*="cookie"] button[class*="agree"]', '[class*="cookie"] button[class*="btn"]',
  '[id*="gdpr"] button[class*="accept"]', '[id*="gdpr"] button[class*="allow"]',
];

const CSS_SUPPRESSION = `[class*="modal-overlay"],[class*="popup-overlay"],[class*="newsletter-popup"],[class*="newsletter-modal"],[class*="signup-modal"],[class*="subscribe-modal"],[class*="exit-intent"],[class*="paywall-overlay"],[class*="adblock-notice"],[class*="age-gate"],[class*="newsletter-widget"],[class*="popup-container"],[class*="notification-popup"],[class*="promo-popup"],[class*="email-popup"],[class*="signup-overlay"],[class*="lead-capture"],[class*="email-capture"],.bis-reset,.klaviyo-popup,.omnisend-popup,.privy-popup,[id*="privy"],[id*="klaviyo"],[class*="wheelio"],[class*="spin-to-win"],[id*="reminder-info"],[class*="reminder-info"],[class*="region-popup"],[class*="locale-popup"],[class*="country-selector-popup"],[class*="geo-redirect"],#onetrust-banner-sdk,.cky-consent-container,.osano-cm-window,[class*="cookie-banner"],[id*="cookie-consent"],[class*="consent-banner"],#shopify-pc__banner{display:none!important;visibility:hidden!important;z-index:-9999!important}body,html{overflow:auto!important;position:static!important}`;

const SITES = [
  // ── Retailers ──
  { name: 'Amazon', url: 'https://www.amazon.com/dp/B0CY6JKBWM' },
  { name: 'Walmart', url: 'https://www.walmart.com/ip/Logitech-G502-X-PLUS-LIGHTSPEED-Wireless-Gaming-Mouse/1836182927' },
  { name: 'Best Buy', url: 'https://www.bestbuy.com/site/logitech-g502-x-plus/6553475.p' },
  { name: 'Newegg', url: 'https://www.newegg.com/p/2BA-00MK-001A8' },
  { name: 'B&H Photo', url: 'https://www.bhphotovideo.com/c/product/1825327-REG/logitech_910_006160_g502_x_plus_wireless.html' },
  { name: 'Micro Center', url: 'https://www.microcenter.com/product/660065/logitech-g502-x-plus-lightspeed-wireless-gaming-mouse-black' },
  { name: 'Target', url: 'https://www.target.com/p/logitech-g502-x-plus-wireless-gaming-mouse/-/A-89638181' },
  { name: 'Adorama', url: 'https://www.adorama.com/log910006160.html' },

  // ── Shopify stores ──
  { name: 'Wellbots (Shopify)', url: 'https://www.wellbots.com/products/madcatz-r-a-t-8-adv-highly-customizable-optical-gaming-mouse' },
  { name: 'Dele Nordic (Shopify)', url: 'https://delenordic.com/products/mad-catz-m-o-j-o-m1-lightweight-optical-gaming-mouse-black' },

  // ── Manufacturers ──
  { name: 'Logitech', url: 'https://www.logitechg.com/en-us/products/gaming-mice/g502-x-plus-wireless-lightspeed-gaming-mouse.910-006160.html' },
  { name: 'Razer', url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro' },
  { name: 'ASUS ROG', url: 'https://rog.asus.com/mice-mouse-pads/mice/wireless/rog-spatha-x-model' },
  { name: 'SteelSeries', url: 'https://steelseries.com/gaming-mice/aerox-5-wireless' },
  { name: 'Corsair', url: 'https://www.corsair.com/us/en/p/gaming-mouse/ch-931c111-na/m75-wireless-lightweight-rgb-gaming-mouse-white-ch-931c111-na/' },
  { name: 'HyperX', url: 'https://hyperx.com/collections/gaming-mice' },
  { name: 'Mad Catz', url: 'https://www.madcatz.com/En/Product/Detail/mojo-m1' },

  // ── Review sites ──
  { name: 'RTINGS', url: 'https://www.rtings.com/mouse/reviews/best/by-usage/gaming' },
  { name: 'Tom\'s Hardware', url: 'https://www.tomshardware.com/best-picks/best-gaming-mouse' },
  { name: 'PCMag', url: 'https://www.pcmag.com/picks/the-best-gaming-mice' },
  { name: 'TechRadar', url: 'https://www.techradar.com/best/best-gaming-mouse' },
  { name: 'The Verge', url: 'https://www.theverge.com/23674582/best-gaming-mouse' },
  { name: 'CNET', url: 'https://www.cnet.com/tech/computing/best-gaming-mouse/' },
  { name: 'WindowsCentral', url: 'https://www.windowscentral.com/best-gaming-mouse' },
  { name: 'TechPowerUp', url: 'https://www.techpowerup.com/review/mad-catz-mojo-m1/3.html' },
  { name: 'Vortez', url: 'https://www.vortez.net/news_story/mad_catz_introduces_m_o_j_o_m1_lightweight_mouse.html' },
  { name: 'PCR Online', url: 'https://pcr-online.biz/2020/11/18/mad-catz-announces-the-m-o-j-o-m1-lightweight-gaming-mouse' },

  // ── Spec/comparison sites ──
  { name: 'Versus', url: 'https://versus.com/en/logitech-g502-x-plus' },
  { name: 'MouseSpecs', url: 'https://mousespecs.org/mad-catz-mojo-m1' },
  { name: 'RedditRecs', url: 'https://redditrecs.com/gaming-mouse/model/mad-catz-mojo-m1' },

  // ── Forums ──
  { name: 'Reddit MouseReview', url: 'https://www.reddit.com/r/MouseReview/' },
  { name: 'Reddit Gaming', url: 'https://www.reddit.com/r/pcgaming/' },

  // ── European/international retailers ──
  { name: 'Alternate.de', url: 'https://www.alternate.de/Logitech/G502-X-PLUS-Gaming-Maus/html/product/1864220' },
  { name: 'LDLC.com', url: 'https://www.ldlc.com/en/product/PB00579621.html' },
  { name: 'Overclockers UK', url: 'https://www.overclockers.co.uk/logitech-g502-x-plus-lightspeed-wireless-gaming-mouse-black-kb-0lh-lg.html' },

  // ── Known popup-heavy sites ──
  { name: 'Forbes', url: 'https://www.forbes.com/sites/technology/' },
  { name: 'NY Times', url: 'https://www.nytimes.com/wirecutter/reviews/best-gaming-mouse/' },
  { name: 'Medium', url: 'https://medium.com/tag/gaming-mouse' },
  { name: 'BuzzFeed', url: 'https://www.buzzfeed.com/' },

  // ── Clean sites (zero false positive check) ──
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Computer_mouse' },
  { name: 'MDN Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' },
  { name: 'GitHub', url: 'https://github.com/microsoft/playwright' },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com/questions/tagged/playwright' },

  // ── More retailers ──
  { name: 'CDW', url: 'https://www.cdw.com/search/?key=gaming+mouse' },
  { name: 'GameStop', url: 'https://www.gamestop.com/search/?q=gaming+mouse' },
  { name: 'Office Depot', url: 'https://www.officedepot.com/a/browse/gaming-mice/N=5+100432/' },

  // ── More manufacturers ──
  { name: 'Glorious', url: 'https://www.gloriousgaming.com/collections/mice' },
  { name: 'Endgame Gear', url: 'https://www.endgamegear.com/mice' },
  { name: 'Zowie', url: 'https://zowie.benq.com/en-us/mouse.html' },
  { name: 'Pulsar', url: 'https://www.pulsargg.com/collections/mice' },
];

async function auditSite(browser, site) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    // Layer 1: CSS suppression (before goto)
    await page.addInitScript(`var s=document.createElement('style');s.textContent=${JSON.stringify(CSS_SUPPRESSION)};(document.head||document.documentElement).appendChild(s);`);

    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(4000);

    // Scan BEFORE dismissal — what popups exist?
    const popupsBefore = await page.evaluate(() => {
      const res = [];
      for (const el of document.querySelectorAll('*')) {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        const z = parseInt(s.zIndex, 10);
        if (isNaN(z) || z < 100) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 100 || r.height < 40) continue;
        const cov = Math.round((r.width * r.height) / (window.innerWidth * window.innerHeight) * 100);
        if (cov < 5) continue;
        res.push({
          id: el.id || '', class: (el.className || '').toString().slice(0, 60),
          z, cov, text: (el.innerText || '').slice(0, 60).replace(/\n/g, ' '),
        });
      }
      return res.sort((a, b) => b.z - a.z).slice(0, 5);
    });

    // Cookie consent — try selectors
    let cookieClicked = 0;
    for (const sel of COOKIE_SELECTORS) {
      try {
        const btns = await page.locator(sel).all();
        for (const btn of btns) {
          const vis = await btn.isVisible().catch(() => false);
          if (!vis) continue;
          await btn.click({ timeout: 1500 });
          cookieClicked++;
          break;
        }
        if (cookieClicked > 0) break;
      } catch {}
    }

    // Overlay dismissal heuristic
    let overlaysRemoved = 0;
    try {
      const detected = await page.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const res = [];
        for (const el of document.querySelectorAll('*')) {
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          if (s.position !== 'fixed' && s.position !== 'absolute') continue;
          const z = parseInt(s.zIndex, 10);
          if (isNaN(z) || z < 999) continue;
          const r = el.getBoundingClientRect();
          if ((r.width * r.height) / (vw * vh) < 0.3) continue;
          el.setAttribute('data-sf-overlay', String(res.length));
          res.push({ index: res.length });
        }
        return res;
      });
      for (const o of detected) {
        try {
          await page.evaluate((idx) => { const el = document.querySelector(`[data-sf-overlay="${idx}"]`); if (el) el.remove(); }, o.index);
          overlaysRemoved++;
        } catch {}
      }
    } catch {}

    // Scroll-lock check
    let scrollLock = false;
    try {
      scrollLock = await page.evaluate(() => {
        const bs = window.getComputedStyle(document.body);
        const hs = window.getComputedStyle(document.documentElement);
        const locked = bs.overflow === 'hidden' || hs.overflow === 'hidden';
        if (locked) { document.body.style.overflow = 'auto'; document.documentElement.style.overflow = 'auto'; }
        return locked;
      });
    } catch {}

    // Scan AFTER dismissal — what's left?
    const popupsAfter = await page.evaluate(() => {
      const res = [];
      for (const el of document.querySelectorAll('*')) {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        const z = parseInt(s.zIndex, 10);
        if (isNaN(z) || z < 500) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 80) continue;
        const cov = Math.round((r.width * r.height) / (window.innerWidth * window.innerHeight) * 100);
        if (cov < 10) continue;
        const text = (el.innerText || '').slice(0, 60).replace(/\n/g, ' ');
        // Ignore nav bars and headers
        if (el.tagName === 'NAV' || el.tagName === 'HEADER') continue;
        if ((el.className || '').toString().toLowerCase().includes('nav')) continue;
        res.push({ z, cov, text, id: el.id || '', class: (el.className || '').toString().slice(0, 40) });
      }
      return res.sort((a, b) => b.z - a.z).slice(0, 3);
    });

    const urlStable = page.url().includes(new URL(site.url).hostname);

    return {
      popupsBefore: popupsBefore.length,
      cookieClicked,
      overlaysRemoved,
      scrollLock,
      popupsAfter,
      urlStable,
      error: null,
    };
  } catch (err) {
    return { popupsBefore: 0, cookieClicked: 0, overlaysRemoved: 0, scrollLock: false, popupsAfter: [], urlStable: false, error: err.message?.slice(0, 50) };
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('50-Site Fetch Plugin Audit');
  console.log('='.repeat(80));
  console.log();

  const browser = await chromium.launch({ headless: true });
  const results = [];
  let passed = 0, missed = 0, errors = 0;

  for (const site of SITES) {
    process.stdout.write(`  ${site.name.padEnd(22)} `);
    const r = await auditSite(browser, site);
    r.name = site.name;
    results.push(r);

    if (r.error) {
      console.log(`ERROR: ${r.error}`);
      errors++;
      continue;
    }

    const afterCount = r.popupsAfter.length;
    const status = afterCount === 0 ? 'CLEAN' : 'REMAINING';
    console.log(
      `before=${r.popupsBefore} cookie=${r.cookieClicked} overlay=${r.overlaysRemoved}`,
      `scroll=${r.scrollLock ? 'RESET' : 'ok'} after=${afterCount} url=${r.urlStable ? 'ok' : 'CHANGED'}`,
      status,
    );

    if (afterCount > 0) {
      for (const p of r.popupsAfter) {
        console.log(`    z=${p.z} cov=${p.cov}% "${p.text.slice(0, 50)}" id=${p.id.slice(0, 20)} class=${p.class.slice(0, 30)}`);
      }
      missed++;
    } else {
      passed++;
    }
  }

  await browser.close();

  console.log();
  console.log('='.repeat(80));
  console.log(`RESULTS: ${passed} clean, ${missed} remaining popups, ${errors} errors out of ${SITES.length} sites`);
  console.log('='.repeat(80));

  // Summary of misses
  const misses = results.filter(r => r.popupsAfter.length > 0);
  if (misses.length > 0) {
    console.log();
    console.log('REMAINING POPUPS (need new selectors):');
    for (const m of misses) {
      console.log(`  ${m.name}:`);
      for (const p of m.popupsAfter) {
        console.log(`    z=${p.z} cov=${p.cov}% "${p.text.slice(0, 50)}" class=${p.class}`);
      }
    }
  }
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
