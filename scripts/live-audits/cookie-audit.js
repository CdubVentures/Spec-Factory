#!/usr/bin/env node
/**
 * Audit every domain from the last run — check what cookie banners
 * and popups exist and whether our selectors match them.
 */
import { chromium } from 'playwright';

const URLS = [
  'https://www.madcatz.com/En/Product/Detail/mojo-m1',
  'https://www.reddit.com/r/MouseReview/comments/jx2jrv/mad_catz_announces_the_mojo_m1_lightweight_gaming',
  'https://www.amazon.com/Mad-Catz-Mojo/s?k=Mad+Catz+Mojo',
  'https://www.pcmag.com/reviews/mad-catz-mojo-m1-gaming-mouse',
  'https://www.techpowerup.com/review/mad-catz-mojo-m1/3.html',
  'https://www.newegg.com/mad-catz-mm04dcinbl00-m-o-j-o-m1-wired/p/N82E16826855003',
  'https://mousespecs.org/mad-catz-mojo-m1',
  'https://delenordic.com/products/mad-catz-m-o-j-o-m1-lightweight-optical-gaming-mouse-black',
  'https://www.vortez.net/news_story/mad_catz_introduces_m_o_j_o_m1_lightweight_mouse.html',
  'https://www.windowscentral.com/mad-catz-mojo-m1-review',
  'https://www.walmart.com/ip/15559760748',
  'https://www.techradar.com/reviews/mad-catz-mojo-m1-mouse',
  'https://www.bestbuy.com/product/mad-catz-m-o-j-o-m1-ultra-lightweight-gaming-mouse-with-dakota-technology-12000-dpi-opti',
  'https://pcr-online.biz/2020/11/18/mad-catz-announces-the-m-o-j-o-m1-lightweight-gaming-mouse',
  'https://redditrecs.com/gaming-mouse/model/mad-catz-mojo-m1',
];

const COOKIE_SELECTORS = [
  '#onetrust-accept-btn-handler', '.cc-accept', '.cc-allow',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '[id*="cookie"] button[class*="accept"]', '.cmp-accept',
  '.shopify-pc__banner__btn-accept', '#shopify-pc__banner button[class*="accept"]',
  '.js-cookie-accept', '[data-cookie-accept]',
  'button[class*="cookie-accept"]', 'button[class*="consent-accept"]',
  '#cookie-policy-info .btn-ok', 'button[class*="btn-read-ck"]',
  'button[class*="accept-all"]', 'button[class*="acceptAll"]',
];

async function auditSite(browser, url) {
  const host = new URL(url).hostname.replace('www.', '');
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(4000);

    // Find ALL visible fixed/absolute popups
    const popups = await page.evaluate(() => {
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
        res.push({
          tag: el.tagName, id: el.id || '', class: (el.className || '').toString().slice(0, 80),
          z, w: Math.round(r.width), h: Math.round(r.height), cov,
          text: (el.innerText || '').slice(0, 80).replace(/\n/g, ' '),
        });
      }
      return res.sort((a, b) => b.z - a.z);
    });

    // Check which cookie selectors match
    const matches = [];
    for (const sel of COOKIE_SELECTORS) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) matches.push(sel);
      } catch {}
    }

    // Check for generic accept/agree buttons
    const genericBtns = await page.evaluate(() => {
      const res = [];
      for (const el of document.querySelectorAll('button, [role="button"], a.btn')) {
        if (window.getComputedStyle(el).display === 'none') continue;
        const text = (el.innerText || '').trim().toLowerCase();
        if (text.includes('accept') || text.includes('agree') || text.includes('got it') || text.includes('i understand') || text.includes('allow') || text.includes('consent')) {
          res.push({ tag: el.tagName, class: (el.className || '').toString().slice(0, 60), text: text.slice(0, 40) });
        }
      }
      return res;
    });

    return { host, popups, matches, genericBtns, error: null };
  } catch (err) {
    return { host, popups: [], matches: [], genericBtns: [], error: err.message?.slice(0, 60) };
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('Cookie & Popup Audit — All Domains from Last Run');
  console.log('='.repeat(70));
  console.log();

  const browser = await chromium.launch({ headless: true });

  for (const url of URLS) {
    const r = await auditSite(browser, url);
    const popupCount = r.popups.length;
    const matchCount = r.matches.length;
    const btnCount = r.genericBtns.length;

    process.stdout.write(`${r.host.padEnd(25)} `);
    if (r.error) {
      console.log(`ERROR: ${r.error}`);
      continue;
    }

    console.log(`popups=${popupCount} selectors=${matchCount} buttons=${btnCount}`);

    if (popupCount > 0) {
      for (const p of r.popups.slice(0, 3)) {
        console.log(`  z=${String(p.z).padStart(8)} ${p.w}x${p.h} cov=${p.cov}% ${p.tag} id=${p.id.slice(0, 20)} text="${p.text.slice(0, 60)}"`);
      }
    }
    if (matchCount > 0) {
      console.log(`  MATCHED: ${r.matches.join(', ')}`);
    }
    if (btnCount > 0 && matchCount === 0) {
      console.log(`  UNMATCHED BUTTONS:`);
      for (const b of r.genericBtns.slice(0, 3)) {
        console.log(`    ${b.tag} class=${b.class} text="${b.text}"`);
      }
    }
    console.log();
  }

  await browser.close();
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
