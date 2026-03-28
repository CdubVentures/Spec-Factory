#!/usr/bin/env node
/**
 * Re-test the 15 failures from the 289-site audit + ASUS ROG forum link
 * with the updated CSS selectors, CMP blocking, and periodic rescan.
 */
import { chromium } from 'playwright';

const CSS = `[class*="modal-overlay"],[class*="popup-overlay"],[class*="newsletter-popup"],[class*="newsletter-modal"],[class*="signup-modal"],[class*="subscribe-modal"],[class*="exit-intent"],[class*="paywall-overlay"],[class*="adblock-notice"],[class*="age-gate"],[class*="newsletter-widget"],[class*="popup-container"],[class*="notification-popup"],[class*="promo-popup"],[class*="email-popup"],[class*="signup-overlay"],[class*="lead-capture"],[class*="email-capture"],.bis-reset,.klaviyo-popup,.omnisend-popup,.privy-popup,[id*="privy"],[id*="klaviyo"],[class*="wheelio"],[class*="spin-to-win"],[id*="reminder-info"],[class*="reminder-info"],[class*="region-popup"],[class*="locale-popup"],[class*="country-selector-popup"],[class*="geo-redirect"],#onetrust-banner-sdk,.cky-consent-container,.osano-cm-window,[class*="cookie-banner"],[id*="cookie-consent"],[id*="cookie-policy"],[class*="consent-banner"],[class*="cookie-policy"],[class*="sd-cmp"],[class*="evidon-banner"],[class*="adnsticky"],.cc-window,.cc-banner,[class*="cc-window"],[class*="cc-banner"],#shopify-pc__banner{display:none!important;visibility:hidden!important;z-index:-9999!important}body,html{overflow:auto!important;position:static!important}`;

const CMP_DOMAINS = [
  'onetrust.com', 'cookielaw.org', 'cookie-script.com', 'cookieyes.com',
  'osano.com', 'transcend-cdn.com', 'cookiebot.com', 'didomi.io',
  'quantcast.com', 'trustarc.com', 'consent-manager', 'sourcepoint',
  'fundingchoices', 'evidon.com', 'crownpeak.com',
];

const INIT_SCRIPT = `
  var s=document.createElement('style');s.textContent=${JSON.stringify(CSS)};(document.head||document.documentElement).appendChild(s);
  try{Object.defineProperty(window,'OneTrust',{get:function(){return{Init:function(){},LoadBanner:function(){},ToggleInfoDisplay:function(){},Close:function(){}}},set:function(){},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'OptanonWrapper',{get:function(){return function(){}},set:function(){},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'ckyBannerInit',{get:function(){return function(){}},set:function(){},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'Osano',{get:function(){return{cm:{addEventListener:function(){},showDrawer:function(){},mode:'production'}}},set:function(){},configurable:true})}catch(e){}
  try{window.Shopify=window.Shopify||{};Object.defineProperty(window.Shopify,'CustomerPrivacy',{get:function(){return{setTrackingConsent:function(){},shouldShowBanner:function(){return false},currentVisitorConsent:function(){return{marketing:'yes',analytics:'yes',preferences:'yes',sale_of_data:'yes'}}}},set:function(){},configurable:true})}catch(e){}
  window.__sfOverlayGuard={caught:0};window.__sfObsStarted=false;
  function _sfCheck(n){try{if(n.nodeType!==1)return;if(n.tagName==='NAV'||n.tagName==='HEADER')return;var cls=(n.className||'').toString().toLowerCase();if(cls.includes('nav-')&&!cls.includes('consent')&&!cls.includes('cookie')&&!cls.includes('banner'))return;var s=window.getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return;if(s.position!=='fixed'&&s.position!=='absolute')return;var z=parseInt(s.zIndex,10);if(isNaN(z)||z<500)return;var r=n.getBoundingClientRect();if(r.width<100||r.height<40)return;var cov=(r.width*r.height)/(window.innerWidth*window.innerHeight);if(cov<0.08)return;n.remove();window.__sfOverlayGuard.caught++;}catch(e){}}
  function _sfStart(){if(!document.body||window.__sfObsStarted)return false;window.__sfObsStarted=true;var obs=new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){var added=muts[i].addedNodes;for(var j=0;j<added.length;j++){_sfCheck(added[j]);if(added[j].nodeType===1){var kids=added[j].querySelectorAll('*');for(var k=0;k<kids.length;k++)_sfCheck(kids[k]);}}}});obs.observe(document.body,{childList:true,subtree:true});var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++)_sfCheck(all[i]);
  var _sfTargetSels=['#cookie-policy-info','#onetrust-banner-sdk','#shopify-pc__banner','.cc-window','.cc-banner','[class*="sd-cmp"]','[class*="evidon"]','[class*="adnsticky"]','[class*="cmplz-cookiebanner"]','[class*="didomi-popup"]','[class*="qc-cmp"]','[class*="reminder-info"]','[class*="bluecore"]','[class*="nomask"]','[class*="region-popup"]'];
  var _rc=0;var _ri=setInterval(function(){_rc++;for(var si=0;si<_sfTargetSels.length;si++){try{var els=document.querySelectorAll(_sfTargetSels[si]);for(var ei=0;ei<els.length;ei++){var el=els[ei];if(el.tagName==='NAV'||el.tagName==='HEADER')continue;var cs=window.getComputedStyle(el);if(cs.display==='none')continue;el.remove();window.__sfOverlayGuard.caught++;}}catch(e){}}if(document.body&&window.getComputedStyle(document.body).overflow==='hidden')document.body.style.setProperty('overflow','auto','important');if(document.documentElement&&window.getComputedStyle(document.documentElement).overflow==='hidden')document.documentElement.style.setProperty('overflow','auto','important');if(_rc>=5)clearInterval(_ri);},2000);return true;}
  if(!_sfStart()){document.addEventListener('DOMContentLoaded',_sfStart);var _p=0,_pi=setInterval(function(){_p++;if(_sfStart()||_p>50)clearInterval(_pi);},100);}
`;

const SITES = [
  // 15 failures from the 289-site audit
  { name: 'ASUS ROG (mouse)', url: 'https://rog.asus.com/mice-mouse-pads/mice/wireless/rog-spatha-x-model' },
  { name: 'ASUS (monitor)', url: 'https://www.asus.com/displays-desktops/monitors/gaming/all-series/' },
  { name: 'ASUS (GPU)', url: 'https://www.asus.com/motherboards-components/graphics-cards/all-series/' },
  { name: 'FlatpanelHD', url: 'https://www.flatpanelshd.com/reviews.php' },
  { name: 'igorsLAB', url: 'https://www.igorslab.de/en/' },
  { name: 'TechGearLab', url: 'https://www.techgearlab.com/' },
  { name: 'Gizmodo', url: 'https://gizmodo.com/tech' },
  { name: 'Kotaku', url: 'https://kotaku.com/' },
  { name: 'Vaxee XE', url: 'https://vaxee.co/' },
  { name: 'Lenovo', url: 'https://www.lenovo.com/us/en/accessories/keyboards-and-mice/' },
  { name: 'CoolBlue.nl', url: 'https://www.coolblue.nl/gaming-muizen' },
  { name: 'WePC', url: 'https://www.wepc.com/' },
  { name: 'GamingScan', url: 'https://www.gamingscan.com/' },
  { name: 'Tweakers.net', url: 'https://tweakers.net/' },
  { name: 'Les Numeriques', url: 'https://www.lesnumeriques.com/' },
  // User's specific link
  { name: 'ASUS ROG Forum', url: 'https://rog-forum.asus.com/t5/rog-zephyrus-series/rog-gx1000-eagle-eye/td-p/378043' },
];

async function test(browser, site) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await ctx.newPage();
  try {
    await page.route('**/*', (route) => {
      const url = route.request().url().toLowerCase();
      if (CMP_DOMAINS.some((d) => url.includes(d))) return route.abort();
      return route.continue();
    });
    await page.addInitScript(INIT_SCRIPT);
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(4000);

    // Layer 2: Explicit post-load targeted removal (mirrors onDismiss heuristic)
    // WHY: CSS suppression loses specificity war, observer skips display:none elements.
    // This runs AFTER site JS has had time to override our CSS, so elements are visible.
    try {
      await page.evaluate(() => {
        const KILL_SELS = [
          '#cookie-policy-info', '#onetrust-banner-sdk', '#shopify-pc__banner',
          '.cc-window', '.cc-banner', '[class*="sd-cmp"]', '[class*="evidon"]',
          '[class*="adnsticky"]', '[class*="cmplz-cookiebanner"]',
          '[class*="didomi-popup"]', '[class*="qc-cmp"]',
          '[class*="reminder-info"]', '[class*="bluecore"]',
          '[class*="nomask"]', '[class*="region-popup"]',
          '[class*="gg-overlay"]', '[class*="q21931-modal"]',
        ];
        for (const sel of KILL_SELS) {
          for (const el of document.querySelectorAll(sel)) {
            if (el.tagName === 'NAV' || el.tagName === 'HEADER') continue;
            el.remove();
          }
        }
        // Fix scroll-lock
        document.body.style.setProperty('overflow', 'auto', 'important');
        document.documentElement.style.setProperty('overflow', 'auto', 'important');
      });
    } catch {}

    // Layer 2b: Generic heuristic scan for anything we missed
    try {
      await page.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        for (const el of document.querySelectorAll('*')) {
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          if (s.position !== 'fixed' && s.position !== 'absolute') continue;
          if (el.tagName === 'NAV' || el.tagName === 'HEADER') continue;
          const z = parseInt(s.zIndex, 10);
          if (isNaN(z) || z < 999) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 100 || r.height < 40) continue;
          const cov = (r.width * r.height) / (vw * vh);
          if (cov < 0.1) continue;
          el.remove();
        }
        document.body.style.setProperty('overflow', 'auto', 'important');
        document.documentElement.style.setProperty('overflow', 'auto', 'important');
      });
    } catch {}

    await page.waitForTimeout(500);

    const popups = await page.evaluate(() => {
      const res = [];
      for (const el of document.querySelectorAll('*')) {
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        if (el.tagName === 'NAV' || el.tagName === 'HEADER') continue;
        const cls = (el.className || '').toString().toLowerCase();
        if (cls.includes('nav') && !cls.includes('consent') && !cls.includes('cookie')) continue;
        const z = parseInt(s.zIndex, 10);
        if (isNaN(z) || z < 500) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 80) continue;
        const cov = Math.round((r.width * r.height) / (1280 * 720) * 100);
        if (cov < 10) continue;
        res.push({ z, cov, text: (el.innerText || '').slice(0, 60).replace(/\n/g, ' '), class: cls.slice(0, 50), id: el.id || '' });
      }
      return res.sort((a, b) => b.z - a.z).slice(0, 3);
    });
    const obs = await page.evaluate(() => window.__sfOverlayGuard?.caught ?? 0).catch(() => 0);
    const scroll = await page.evaluate(() =>
      window.getComputedStyle(document.body).overflow === 'hidden'
      || window.getComputedStyle(document.documentElement).overflow === 'hidden',
    ).catch(() => false);
    return { popups, obs, scroll, error: null };
  } catch (err) {
    return { popups: [], obs: 0, scroll: false, error: err.message?.slice(0, 60) };
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('  Failure Re-check — Updated CSS + CMP blocking + periodic rescan');
  console.log('='.repeat(80));
  console.log();

  const browser = await chromium.launch({ headless: true });
  let clean = 0, remaining = 0, errors = 0;

  for (const site of SITES) {
    const r = await test(browser, site);
    const status = r.error ? 'ERROR' : r.popups.length === 0 ? 'CLEAN' : 'REMAINING';
    if (status === 'CLEAN') clean++;
    else if (status === 'ERROR') errors++;
    else remaining++;

    const icon = status === 'CLEAN' ? 'PASS' : status === 'ERROR' ? 'ERR ' : 'FAIL';
    console.log(`  [${icon}] ${site.name.padEnd(22)} obs=${r.obs} scroll=${r.scroll ? 'LOCKED' : 'ok'} after=${r.popups.length} ${status}`);
    for (const p of r.popups) {
      console.log(`         z=${p.z} cov=${p.cov}% "${p.text.slice(0, 45)}" class=${p.class.slice(0, 30)}`);
    }
    if (r.error) console.log(`         ${r.error}`);
  }

  await browser.close();
  console.log();
  console.log('='.repeat(80));
  console.log(`  RESULT: ${clean} clean, ${remaining} remaining, ${errors} errors out of ${SITES.length}`);
  console.log('='.repeat(80));
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
