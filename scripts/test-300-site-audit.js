#!/usr/bin/env node
/**
 * 300-site audit — comprehensive fetch plugin suite validation across
 * retailers, review platforms, manufacturers, spec databases, forums,
 * international sites, and popup-heavy news sites.
 *
 * Tests: cookie consent, overlay dismissal (3 layers), CMP script blocking,
 * CMP global stubbing, MutationObserver, scroll-lock reset, URL stability.
 *
 * Runs 5 sites concurrently for throughput.
 */
import { chromium } from 'playwright';

// ── Cookie consent fallback selectors (mirrors cookieConsentPlugin.js) ──
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
  '.cky-btn-accept', 'button[class*="cky-btn-accept"]',
  '.osano-cm-accept-all', 'button[class*="osano-cm-accept"]',
  '.cookie-banner button[class*="accept"]', '.cookie-banner button[class*="btn"]',
  '[class*="cookie-banner"] button:first-of-type',
];

// ── CSS suppression (mirrors overlayDismissalPlugin.js SUPPRESSION_CSS) ──
const CSS_SUPPRESSION = `[class*="modal-overlay"],[class*="popup-overlay"],[class*="newsletter-popup"],[class*="newsletter-modal"],[class*="signup-modal"],[class*="subscribe-modal"],[class*="exit-intent"],[class*="paywall-overlay"],[class*="adblock-notice"],[class*="age-gate"],[class*="newsletter-widget"],[class*="popup-container"],[class*="notification-popup"],[class*="promo-popup"],[class*="email-popup"],[class*="signup-overlay"],[class*="lead-capture"],[class*="email-capture"],.bis-reset,.klaviyo-popup,.omnisend-popup,.privy-popup,[id*="privy"],[id*="klaviyo"],[class*="wheelio"],[class*="spin-to-win"],[id*="reminder-info"],[class*="reminder-info"],[class*="region-popup"],[class*="locale-popup"],[class*="country-selector-popup"],[class*="geo-redirect"],#onetrust-banner-sdk,.cky-consent-container,.osano-cm-window,[class*="cookie-banner"],[id*="cookie-consent"],[id*="cookie-policy"],[class*="consent-banner"],[class*="cookie-policy"],#shopify-pc__banner{display:none!important;visibility:hidden!important;z-index:-9999!important}body,html{overflow:auto!important;position:static!important}`;

// ── Init script (mirrors optimized overlayDismissalPlugin.js buildInitScript) ──
const INIT_SCRIPT = `
  var s=document.createElement('style');s.textContent=${JSON.stringify(CSS_SUPPRESSION)};(document.head||document.documentElement).appendChild(s);
  try{Object.defineProperty(window,'OneTrust',{get:function(){return{Init:function(){},LoadBanner:function(){},ToggleInfoDisplay:function(){},Close:function(){}}},set:function(){},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'OptanonWrapper',{get:function(){return function(){}},set:function(){},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'ckyBannerInit',{get:function(){return function(){}},set:function(){},configurable:true})}catch(e){}
  try{Object.defineProperty(window,'Osano',{get:function(){return{cm:{addEventListener:function(){},showDrawer:function(){},mode:'production'}}},set:function(){},configurable:true})}catch(e){}
  try{window.Shopify=window.Shopify||{};Object.defineProperty(window.Shopify,'CustomerPrivacy',{get:function(){return{setTrackingConsent:function(){},shouldShowBanner:function(){return false},currentVisitorConsent:function(){return{marketing:'yes',analytics:'yes',preferences:'yes',sale_of_data:'yes'}}}},set:function(){},configurable:true})}catch(e){}
  window.__sfOverlayGuard={caught:0};window.__sfObsStarted=false;
  function _sfCheck(n){try{if(n.nodeType!==1)return;if(n.tagName==='NAV'||n.tagName==='HEADER')return;var cls=(n.className||'').toString().toLowerCase();if(cls.includes('nav-')&&!cls.includes('consent')&&!cls.includes('cookie')&&!cls.includes('banner'))return;var s=window.getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return;if(s.position!=='fixed'&&s.position!=='absolute')return;var z=parseInt(s.zIndex,10);if(isNaN(z)||z<500)return;var r=n.getBoundingClientRect();if(r.width<100||r.height<40)return;var cov=(r.width*r.height)/(window.innerWidth*window.innerHeight);if(cov<0.08)return;n.remove();window.__sfOverlayGuard.caught++;}catch(e){}}
  function _sfStart(){if(!document.body||window.__sfObsStarted)return false;window.__sfObsStarted=true;var obs=new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){var added=muts[i].addedNodes;for(var j=0;j<added.length;j++){_sfCheck(added[j]);if(added[j].nodeType===1){var kids=added[j].querySelectorAll('*');for(var k=0;k<kids.length;k++)_sfCheck(kids[k]);}}}});obs.observe(document.body,{childList:true,subtree:true});var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++)_sfCheck(all[i]);var _rc=0;var _ri=setInterval(function(){_rc++;var els=document.querySelectorAll('*');for(var ri=0;ri<els.length;ri++)_sfCheck(els[ri]);if(_rc>=5)clearInterval(_ri);},2000);return true;}
  if(!_sfStart()){document.addEventListener('DOMContentLoaded',_sfStart);var _p=0,_pi=setInterval(function(){_p++;if(_sfStart()||_p>50)clearInterval(_pi);},100);}
`;

// ── CMP domains to block via route interception ──
const CMP_DOMAINS = [
  'onetrust.com', 'cookielaw.org', 'cookie-script.com', 'cookieyes.com',
  'osano.com', 'transcend-cdn.com', 'cookiebot.com', 'didomi.io',
  'quantcast.com', 'trustarc.com', 'consent-manager', 'sourcepoint',
  'fundingchoices',
];

// ═══════════════════════════════════════════════════════════════════════
// Site list — 300 targets across 9 categories
// ═══════════════════════════════════════════════════════════════════════
const SITES = [
  // ── RETAILERS: Mice ──
  { cat: 'retailer', name: 'Amazon (mouse)', url: 'https://www.amazon.com/dp/B0CY6JKBWM' },
  { cat: 'retailer', name: 'Walmart (mouse)', url: 'https://www.walmart.com/ip/Logitech-G502-X-PLUS-LIGHTSPEED-Wireless-Gaming-Mouse/1836182927' },
  { cat: 'retailer', name: 'Best Buy (mouse)', url: 'https://www.bestbuy.com/site/logitech-g502-x-plus/6553475.p' },
  { cat: 'retailer', name: 'Newegg (mouse)', url: 'https://www.newegg.com/p/2BA-00MK-001A8' },
  { cat: 'retailer', name: 'B&H Photo (mouse)', url: 'https://www.bhphotovideo.com/c/product/1825327-REG/logitech_910_006160_g502_x_plus_wireless.html' },
  { cat: 'retailer', name: 'Micro Center (mouse)', url: 'https://www.microcenter.com/product/660065/logitech-g502-x-plus-lightspeed-wireless-gaming-mouse-black' },
  { cat: 'retailer', name: 'Target (mouse)', url: 'https://www.target.com/p/logitech-g502-x-plus-wireless-gaming-mouse/-/A-89638181' },
  { cat: 'retailer', name: 'Adorama (mouse)', url: 'https://www.adorama.com/log910006160.html' },
  // ── RETAILERS: Keyboards ──
  { cat: 'retailer', name: 'Amazon (keyboard)', url: 'https://www.amazon.com/dp/B0CX7Y42Y7' },
  { cat: 'retailer', name: 'Best Buy (keyboard)', url: 'https://www.bestbuy.com/site/searchpage.jsp?st=keychron+q1' },
  { cat: 'retailer', name: 'Newegg (keyboard)', url: 'https://www.newegg.com/p/pl?d=mechanical+keyboard' },
  { cat: 'retailer', name: 'mechanicalkeyboards.com', url: 'https://www.mechanicalkeyboards.com/keyboards' },
  { cat: 'retailer', name: 'Drop.com', url: 'https://drop.com/mechanical-keyboards/drops' },
  // ── RETAILERS: Monitors ──
  { cat: 'retailer', name: 'Amazon (monitor)', url: 'https://www.amazon.com/dp/B0D5CQ33CJ' },
  { cat: 'retailer', name: 'Best Buy (monitor)', url: 'https://www.bestbuy.com/site/searchpage.jsp?st=gaming+monitor+oled' },
  { cat: 'retailer', name: 'B&H Photo (monitor)', url: 'https://www.bhphotovideo.com/c/buy/Gaming-Monitors/ci/37600' },
  { cat: 'retailer', name: 'Micro Center (monitor)', url: 'https://www.microcenter.com/category/4294966896/gaming-monitors' },
  // ── RETAILERS: GPUs ──
  { cat: 'retailer', name: 'Amazon (GPU)', url: 'https://www.amazon.com/dp/B0DJHB9C3Y' },
  { cat: 'retailer', name: 'Best Buy (GPU)', url: 'https://www.bestbuy.com/site/searchpage.jsp?st=rtx+5090' },
  { cat: 'retailer', name: 'Newegg (GPU)', url: 'https://www.newegg.com/p/pl?d=rtx+4090' },
  { cat: 'retailer', name: 'B&H Photo (GPU)', url: 'https://www.bhphotovideo.com/c/buy/Graphics-Cards/ci/6567' },
  // ── RETAILERS: General ──
  { cat: 'retailer', name: 'CDW', url: 'https://www.cdw.com/search/?key=gaming+mouse' },
  { cat: 'retailer', name: 'GameStop', url: 'https://www.gamestop.com/search/?q=gaming+mouse' },
  { cat: 'retailer', name: 'Office Depot', url: 'https://www.officedepot.com/a/browse/gaming-mice/N=5+100432/' },
  { cat: 'retailer', name: 'Staples', url: 'https://www.staples.com/gaming-mice/cat_CL210807' },
  { cat: 'retailer', name: 'Costco', url: 'https://www.costco.com/computer-mice.html' },

  // ── MANUFACTURERS: Mice ──
  { cat: 'manufacturer', name: 'Logitech (mouse)', url: 'https://www.logitechg.com/en-us/products/gaming-mice/g502-x-plus-wireless-lightspeed-gaming-mouse.910-006160.html' },
  { cat: 'manufacturer', name: 'Razer (mouse)', url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro' },
  { cat: 'manufacturer', name: 'Razer DeathAdder', url: 'https://www.razer.com/gaming-mice/razer-deathadder-v3' },
  { cat: 'manufacturer', name: 'ASUS ROG (mouse)', url: 'https://rog.asus.com/mice-mouse-pads/mice/wireless/rog-spatha-x-model' },
  { cat: 'manufacturer', name: 'SteelSeries (mouse)', url: 'https://steelseries.com/gaming-mice/aerox-5-wireless' },
  { cat: 'manufacturer', name: 'Corsair (mouse)', url: 'https://www.corsair.com/us/en/p/gaming-mouse/ch-931c111-na/m75-wireless-lightweight-rgb-gaming-mouse-white-ch-931c111-na/' },
  { cat: 'manufacturer', name: 'HyperX (mouse)', url: 'https://hyperx.com/collections/gaming-mice' },
  { cat: 'manufacturer', name: 'Mad Catz', url: 'https://www.madcatz.com/En/Product/Detail/mojo-m1' },
  { cat: 'manufacturer', name: 'Glorious', url: 'https://www.gloriousgaming.com/collections/mice' },
  { cat: 'manufacturer', name: 'Endgame Gear', url: 'https://www.endgamegear.com/mice' },
  { cat: 'manufacturer', name: 'Zowie (BenQ)', url: 'https://zowie.benq.com/en-us/mouse.html' },
  { cat: 'manufacturer', name: 'Pulsar', url: 'https://www.pulsargg.com/collections/mice' },
  { cat: 'manufacturer', name: 'Roccat', url: 'https://www.roccat.com/Mice' },
  // ── MANUFACTURERS: Keyboards ──
  { cat: 'manufacturer', name: 'Corsair (keyboard)', url: 'https://www.corsair.com/us/en/Categories/Products/Gaming-Keyboards/c/Cor_Products_Keyboards' },
  { cat: 'manufacturer', name: 'Razer (keyboard)', url: 'https://www.razer.com/gaming-keyboards/razer-huntsman-v3-pro' },
  { cat: 'manufacturer', name: 'SteelSeries (keyboard)', url: 'https://steelseries.com/gaming-keyboards/apex-pro-tkl-2023' },
  { cat: 'manufacturer', name: 'Keychron', url: 'https://www.keychron.com/collections/all-keyboards' },
  { cat: 'manufacturer', name: 'Wooting', url: 'https://wooting.io/wooting-60he' },
  { cat: 'manufacturer', name: 'Ducky', url: 'https://www.duckychannel.com.tw/en/keyboards' },
  { cat: 'manufacturer', name: 'Logitech (keyboard)', url: 'https://www.logitechg.com/en-us/products/gaming-keyboards.html' },
  // ── MANUFACTURERS: Monitors ──
  { cat: 'manufacturer', name: 'ASUS (monitor)', url: 'https://www.asus.com/displays-desktops/monitors/gaming/all-series/' },
  { cat: 'manufacturer', name: 'BenQ (monitor)', url: 'https://www.benq.com/en-us/gaming-monitor.html' },
  { cat: 'manufacturer', name: 'Dell Alienware', url: 'https://www.dell.com/en-us/shop/gaming-monitors/ar/7830' },
  { cat: 'manufacturer', name: 'LG (monitor)', url: 'https://www.lg.com/us/monitors/gaming-monitors/' },
  { cat: 'manufacturer', name: 'MSI (monitor)', url: 'https://www.msi.com/Monitors' },
  { cat: 'manufacturer', name: 'Samsung (monitor)', url: 'https://www.samsung.com/us/computing/monitors/gaming-monitors/' },
  { cat: 'manufacturer', name: 'Gigabyte (monitor)', url: 'https://www.gigabyte.com/Monitor' },
  { cat: 'manufacturer', name: 'AOC (monitor)', url: 'https://aoc.com/us/gaming' },
  { cat: 'manufacturer', name: 'ViewSonic', url: 'https://www.viewsonic.com/us/gaming-monitors' },
  // ── MANUFACTURERS: GPUs ──
  { cat: 'manufacturer', name: 'NVIDIA', url: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/' },
  { cat: 'manufacturer', name: 'AMD Radeon', url: 'https://www.amd.com/en/products/graphics/amd-radeon-rx-9070-xt.html' },
  { cat: 'manufacturer', name: 'EVGA', url: 'https://www.evga.com/Products/ProductList.aspx?type=0&family=GeForce+40+Series+Family' },
  { cat: 'manufacturer', name: 'MSI (GPU)', url: 'https://www.msi.com/Graphics-Cards' },
  { cat: 'manufacturer', name: 'Gigabyte (GPU)', url: 'https://www.gigabyte.com/Graphics-Card' },
  { cat: 'manufacturer', name: 'ASUS (GPU)', url: 'https://www.asus.com/motherboards-components/graphics-cards/all-series/' },
  { cat: 'manufacturer', name: 'Sapphire', url: 'https://www.sapphiretech.com/en/consumer/nitro-rx-9070-xt-16g' },
  { cat: 'manufacturer', name: 'XFX', url: 'https://www.xfxforce.com/shop/graphics-cards' },
  { cat: 'manufacturer', name: 'PowerColor', url: 'https://www.powercolor.com/products?type=GPU' },
  { cat: 'manufacturer', name: 'Zotac', url: 'https://www.zotac.com/us/product/graphics_card/all' },
  { cat: 'manufacturer', name: 'PNY', url: 'https://www.pny.com/graphics-cards' },
  { cat: 'manufacturer', name: 'Intel Arc', url: 'https://www.intel.com/content/www/us/en/products/details/discrete-gpus/arc.html' },

  // ── REVIEW SITES: Mice ──
  { cat: 'review', name: 'RTINGS (mouse)', url: 'https://www.rtings.com/mouse/reviews/best/by-usage/gaming' },
  { cat: 'review', name: 'Tom\'s HW (mouse)', url: 'https://www.tomshardware.com/best-picks/best-gaming-mouse' },
  { cat: 'review', name: 'PCMag (mouse)', url: 'https://www.pcmag.com/picks/the-best-gaming-mice' },
  { cat: 'review', name: 'TechRadar (mouse)', url: 'https://www.techradar.com/best/best-gaming-mouse' },
  { cat: 'review', name: 'The Verge (mouse)', url: 'https://www.theverge.com/23674582/best-gaming-mouse' },
  { cat: 'review', name: 'CNET (mouse)', url: 'https://www.cnet.com/tech/computing/best-gaming-mouse/' },
  { cat: 'review', name: 'TechPowerUp (mouse)', url: 'https://www.techpowerup.com/review/mad-catz-mojo-m1/3.html' },
  { cat: 'review', name: 'WindowsCentral', url: 'https://www.windowscentral.com/best-gaming-mouse' },
  // ── REVIEW SITES: Keyboards ──
  { cat: 'review', name: 'RTINGS (keyboard)', url: 'https://www.rtings.com/keyboard/reviews/best/by-usage/gaming' },
  { cat: 'review', name: 'Tom\'s HW (keyboard)', url: 'https://www.tomshardware.com/best-picks/best-gaming-keyboards' },
  { cat: 'review', name: 'PCMag (keyboard)', url: 'https://www.pcmag.com/picks/the-best-gaming-keyboards' },
  { cat: 'review', name: 'TechRadar (keyboard)', url: 'https://www.techradar.com/best/best-gaming-keyboards' },
  // ── REVIEW SITES: Monitors ──
  { cat: 'review', name: 'RTINGS (monitor)', url: 'https://www.rtings.com/monitor/reviews/best/by-usage/gaming' },
  { cat: 'review', name: 'Tom\'s HW (monitor)', url: 'https://www.tomshardware.com/best-picks/best-gaming-monitors' },
  { cat: 'review', name: 'TFTCentral', url: 'https://tftcentral.co.uk/reviews' },
  { cat: 'review', name: 'PCMonitors.info', url: 'https://pcmonitors.info/recommendations/' },
  { cat: 'review', name: 'DisplayNinja', url: 'https://www.displayninja.com/best-gaming-monitor/' },
  { cat: 'review', name: 'FlatpanelHD', url: 'https://www.flatpanelshd.com/reviews.php' },
  { cat: 'review', name: 'NotebookCheck', url: 'https://www.notebookcheck.net/The-Best-Monitors-for-Photo-Editing-and-Video-Editing.652393.0.html' },
  // ── REVIEW SITES: GPUs ──
  { cat: 'review', name: 'Tom\'s HW (GPU)', url: 'https://www.tomshardware.com/best-picks/best-graphics-cards' },
  { cat: 'review', name: 'TechPowerUp (GPU)', url: 'https://www.techpowerup.com/review/' },
  { cat: 'review', name: 'Guru3D', url: 'https://www.guru3d.com/articles-categories/videocards/' },
  { cat: 'review', name: 'KitGuru', url: 'https://www.kitguru.net/components/graphic-cards/' },
  { cat: 'review', name: 'TechSpot', url: 'https://www.techspot.com/bestof/gpu/' },
  // ── REVIEW SITES: General Tech ──
  { cat: 'review', name: 'Ars Technica', url: 'https://arstechnica.com/gadgets/' },
  { cat: 'review', name: 'AnandTech', url: 'https://www.anandtech.com/' },
  { cat: 'review', name: 'PC Gamer', url: 'https://www.pcgamer.com/hardware/gaming-mice/' },
  { cat: 'review', name: 'Rock Paper Shotgun', url: 'https://www.rockpapershotgun.com/hardware' },
  { cat: 'review', name: 'Digital Trends', url: 'https://www.digitaltrends.com/computing/' },
  { cat: 'review', name: 'Tom\'s Guide', url: 'https://www.tomsguide.com/best-picks/best-gaming-mice' },
  { cat: 'review', name: 'Engadget', url: 'https://www.engadget.com/gaming/' },
  { cat: 'review', name: 'Vortez', url: 'https://www.vortez.net/news_story/mad_catz_introduces_m_o_j_o_m1_lightweight_mouse.html' },
  { cat: 'review', name: 'PCR Online', url: 'https://pcr-online.biz/2020/11/18/mad-catz-announces-the-m-o-j-o-m1-lightweight-gaming-mouse' },
  { cat: 'review', name: 'LTT Labs', url: 'https://www.lttlabs.com/' },
  { cat: 'review', name: 'GN Store', url: 'https://store.gamersnexus.net/' },
  { cat: 'review', name: 'Tested', url: 'https://www.tested.com/' },
  { cat: 'review', name: 'Hardware Unboxed', url: 'https://www.youtube.com/@Hardwareunboxed' },
  { cat: 'review', name: 'igorsLAB', url: 'https://www.igorslab.de/en/' },
  { cat: 'review', name: 'TechGearLab', url: 'https://www.techgearlab.com/' },
  { cat: 'review', name: 'Wired', url: 'https://www.wired.com/gallery/best-gaming-mice/' },

  // ── SPEC/COMPARISON DATABASES ──
  { cat: 'database', name: 'PCPartPicker (mouse)', url: 'https://pcpartpicker.com/products/mouse/' },
  { cat: 'database', name: 'PCPartPicker (GPU)', url: 'https://pcpartpicker.com/products/video-card/' },
  { cat: 'database', name: 'PCPartPicker (monitor)', url: 'https://pcpartpicker.com/products/monitor/' },
  { cat: 'database', name: 'PCPartPicker (keyboard)', url: 'https://pcpartpicker.com/products/keyboard/' },
  { cat: 'database', name: 'Versus (mouse)', url: 'https://versus.com/en/logitech-g502-x-plus' },
  { cat: 'database', name: 'Versus (monitor)', url: 'https://versus.com/en/dell-alienware-aw2725df' },
  { cat: 'database', name: 'Versus (GPU)', url: 'https://versus.com/en/nvidia-geforce-rtx-4090' },
  { cat: 'database', name: 'MouseSpecs', url: 'https://mousespecs.org/mad-catz-mojo-m1' },
  { cat: 'database', name: 'DisplaySpecifications', url: 'https://www.displayspecifications.com/' },
  { cat: 'database', name: 'EloseShapes', url: 'https://www.eloshapes.com/' },
  { cat: 'database', name: 'Sensor.fyi', url: 'https://sensor.fyi/sensors/' },
  { cat: 'database', name: 'ProSettings.net', url: 'https://prosettings.net/best-gaming-mouse/' },
  { cat: 'database', name: 'MouseCompare', url: 'https://www.mousecompare.com/' },
  { cat: 'database', name: 'RocketJumpNinja', url: 'https://www.rocketjumpninja.com/top-mice' },
  { cat: 'database', name: 'GamingGem', url: 'https://gaminggem.com/' },
  { cat: 'database', name: 'TheGamingSetup', url: 'https://thegamingsetup.com/' },
  { cat: 'database', name: 'KeebFinder', url: 'https://www.keeb-finder.com/' },
  { cat: 'database', name: 'SwitchesDB', url: 'https://switchesdb.com/' },
  { cat: 'database', name: 'KeyBumps', url: 'https://keybumps.com/' },
  { cat: 'database', name: 'ThereminGoat', url: 'https://www.theremingoat.com/' },
  { cat: 'database', name: 'BlurBusters', url: 'https://blurbusters.com/' },
  { cat: 'database', name: 'DisplayDB', url: 'https://www.displaydb.com/' },
  { cat: 'database', name: 'PanelLook', url: 'https://www.panelook.com/' },
  { cat: 'database', name: 'RedditRecs', url: 'https://redditrecs.com/gaming-mouse/model/mad-catz-mojo-m1' },
  { cat: 'database', name: 'UserBenchmark', url: 'https://gpu.userbenchmark.com/' },
  { cat: 'database', name: 'PassMark', url: 'https://www.videocardbenchmark.net/high_end_gpus.html' },
  { cat: 'database', name: 'TechPowerUp GPU DB', url: 'https://www.techpowerup.com/gpu-specs/' },

  // ── SHOPIFY STORES ──
  { cat: 'shopify', name: 'Wellbots', url: 'https://www.wellbots.com/products/madcatz-r-a-t-8-adv-highly-customizable-optical-gaming-mouse' },
  { cat: 'shopify', name: 'Dele Nordic', url: 'https://delenordic.com/products/mad-catz-m-o-j-o-m1-lightweight-optical-gaming-mouse-black' },
  { cat: 'shopify', name: 'Lethal Gaming Gear', url: 'https://lethalgaminggear.com/' },
  { cat: 'shopify', name: 'X-raypad', url: 'https://shop.x-raypad.com/' },
  { cat: 'shopify', name: 'MaxGaming', url: 'https://maxgaming.com/' },
  { cat: 'shopify', name: 'Agile Cables', url: 'https://www.agilecables.com/' },
  { cat: 'shopify', name: 'Corepad', url: 'https://corepad.com/' },
  { cat: 'shopify', name: 'Artisan USA', url: 'https://www.artisan-jp.com/en/' },
  { cat: 'shopify', name: 'CannonKeys', url: 'https://cannonkeys.com/' },
  { cat: 'shopify', name: 'NovelKeys', url: 'https://novelkeys.com/' },
  { cat: 'shopify', name: 'KBDfans', url: 'https://kbdfans.com/' },
  { cat: 'shopify', name: 'Divinikey', url: 'https://divinikey.com/' },
  { cat: 'shopify', name: 'Kinetic Labs', url: 'https://kineticlabs.com/' },
  { cat: 'shopify', name: 'Dangkeebs', url: 'https://dangkeebs.com/' },
  { cat: 'shopify', name: 'MelGeek', url: 'https://www.melgeek.com/' },

  // ── FORUMS / COMMUNITY ──
  { cat: 'forum', name: 'Reddit MouseReview', url: 'https://www.reddit.com/r/MouseReview/' },
  { cat: 'forum', name: 'Reddit pcgaming', url: 'https://www.reddit.com/r/pcgaming/' },
  { cat: 'forum', name: 'Reddit MechKeyboards', url: 'https://www.reddit.com/r/MechanicalKeyboards/' },
  { cat: 'forum', name: 'Reddit Monitors', url: 'https://www.reddit.com/r/Monitors/' },
  { cat: 'forum', name: 'Reddit nvidia', url: 'https://www.reddit.com/r/nvidia/' },
  { cat: 'forum', name: 'Reddit amd', url: 'https://www.reddit.com/r/Amd/' },
  { cat: 'forum', name: 'GeeKHack', url: 'https://geekhack.org/' },
  { cat: 'forum', name: 'KeebTalk', url: 'https://www.keebtalk.com/' },
  { cat: 'forum', name: 'Deskthority', url: 'https://deskthority.net/' },
  { cat: 'forum', name: 'OCN', url: 'https://www.overclock.net/forums/mice.375/' },
  { cat: 'forum', name: 'Hacker News', url: 'https://news.ycombinator.com/' },
  { cat: 'forum', name: 'HardForum', url: 'https://hardforum.com/' },

  // ── INTERNATIONAL RETAILERS ──
  { cat: 'international', name: 'Alternate.de', url: 'https://www.alternate.de/Logitech/G502-X-PLUS-Gaming-Maus/html/product/1864220' },
  { cat: 'international', name: 'LDLC.com', url: 'https://www.ldlc.com/en/product/PB00579621.html' },
  { cat: 'international', name: 'Overclockers UK', url: 'https://www.overclockers.co.uk/logitech-g502-x-plus-lightspeed-wireless-gaming-mouse-black-kb-0lh-lg.html' },
  { cat: 'international', name: 'CaseKing.de', url: 'https://www.caseking.de/peripherie/maeuse' },
  { cat: 'international', name: 'Scan.co.uk', url: 'https://www.scan.co.uk/shop/gaming/gaming-mice' },
  { cat: 'international', name: 'Box.co.uk', url: 'https://www.box.co.uk/mice-and-pointers/gaming-mice' },
  { cat: 'international', name: 'MindFactory.de', url: 'https://www.mindfactory.de/Hardware/Maeuse+_+Mauspad/Gaming-Maeuse.html' },
  { cat: 'international', name: 'Galaxus.ch', url: 'https://www.galaxus.ch/en/s1/producttype/mouse-543' },
  { cat: 'international', name: 'CoolBlue.nl', url: 'https://www.coolblue.nl/gaming-muizen' },
  { cat: 'international', name: 'PCComponentes.com', url: 'https://www.pccomponentes.com/ratones-gaming' },
  { cat: 'international', name: 'Komplett.no', url: 'https://www.komplett.no/category/11208/gaming/mus-tastatur/mus' },
  { cat: 'international', name: 'Jimms.fi', url: 'https://www.jimms.fi/en/Product/List/000-0GQ/gaming--mice' },
  { cat: 'international', name: 'Scorptec.com.au', url: 'https://www.scorptec.com.au/peripherals/mice-trackballs?cat=543' },
  { cat: 'international', name: 'MemoryExpress.com', url: 'https://www.memoryexpress.com/Category/Mice' },
  { cat: 'international', name: 'PCCG.com.au', url: 'https://www.pccasegear.com/category/258/gaming-mice' },
  { cat: 'international', name: 'MediaMarkt', url: 'https://www.mediamarkt.de/de/category/gaming-maeuse-489.html' },
  { cat: 'international', name: 'Cyberport.de', url: 'https://www.cyberport.de/gaming/gaming-maeuse.html' },
  { cat: 'international', name: 'Notebooksbilliger.de', url: 'https://www.notebooksbilliger.de/gaming+maeuse' },
  { cat: 'international', name: 'eBuyer.com', url: 'https://www.ebuyer.com/store/Peripherals/cat/Gaming-Mice' },
  { cat: 'international', name: 'CDON.com', url: 'https://cdon.se/spel/gaming-tillbehor/gaming-muss/' },

  // ── POPUP-HEAVY / NEWS ──
  { cat: 'news', name: 'Forbes', url: 'https://www.forbes.com/sites/technology/' },
  { cat: 'news', name: 'NY Times Wirecutter', url: 'https://www.nytimes.com/wirecutter/reviews/best-gaming-mouse/' },
  { cat: 'news', name: 'Medium', url: 'https://medium.com/tag/gaming-mouse' },
  { cat: 'news', name: 'BuzzFeed', url: 'https://www.buzzfeed.com/' },
  { cat: 'news', name: 'TechCrunch', url: 'https://techcrunch.com/' },
  { cat: 'news', name: 'ZDNet', url: 'https://www.zdnet.com/' },
  { cat: 'news', name: 'Business Insider', url: 'https://www.businessinsider.com/tech' },
  { cat: 'news', name: 'Mashable', url: 'https://mashable.com/tech' },
  { cat: 'news', name: 'VentureBeat', url: 'https://venturebeat.com/' },
  { cat: 'news', name: 'The Information', url: 'https://www.theinformation.com/' },
  { cat: 'news', name: 'Gizmodo', url: 'https://gizmodo.com/tech' },
  { cat: 'news', name: 'Lifehacker', url: 'https://lifehacker.com/' },
  { cat: 'news', name: 'Verge (news)', url: 'https://www.theverge.com/' },
  { cat: 'news', name: 'Ars Technica (news)', url: 'https://arstechnica.com/' },
  { cat: 'news', name: 'Polygon', url: 'https://www.polygon.com/' },
  { cat: 'news', name: 'Kotaku', url: 'https://kotaku.com/' },
  { cat: 'news', name: 'IGN', url: 'https://www.ign.com/' },
  { cat: 'news', name: 'GameSpot', url: 'https://www.gamespot.com/' },
  { cat: 'news', name: 'PCWorld', url: 'https://www.pcworld.com/' },
  { cat: 'news', name: 'CNN Business', url: 'https://www.cnn.com/business/tech' },

  // ── CLEAN CONTROLS (zero popups expected) ──
  { cat: 'control', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Computer_mouse' },
  { cat: 'control', name: 'MDN Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' },
  { cat: 'control', name: 'GitHub', url: 'https://github.com/microsoft/playwright' },
  { cat: 'control', name: 'Stack Overflow', url: 'https://stackoverflow.com/questions/tagged/playwright' },
  { cat: 'control', name: 'Python Docs', url: 'https://docs.python.org/3/' },
  { cat: 'control', name: 'W3Schools', url: 'https://www.w3schools.com/' },
  { cat: 'control', name: 'DevDocs', url: 'https://devdocs.io/' },
  { cat: 'control', name: 'Can I Use', url: 'https://caniuse.com/' },
  { cat: 'control', name: 'CSS-Tricks', url: 'https://css-tricks.com/' },
  { cat: 'control', name: 'web.dev', url: 'https://web.dev/' },

  // ── ADDITIONAL PRODUCT PAGES (mixed categories) ──
  { cat: 'product', name: 'RTINGS G502X review', url: 'https://www.rtings.com/mouse/reviews/logitech/g502-x-plus-wireless' },
  { cat: 'product', name: 'RTINGS Viper V3', url: 'https://www.rtings.com/mouse/reviews/razer/viper-v3-pro' },
  { cat: 'product', name: 'RTINGS AW2725DF', url: 'https://www.rtings.com/monitor/reviews/dell/alienware-aw2725df' },
  { cat: 'product', name: 'RTINGS PG27AQDM', url: 'https://www.rtings.com/monitor/reviews/asus/rog-swift-pg27aqdm' },
  { cat: 'product', name: 'RTINGS K100', url: 'https://www.rtings.com/keyboard/reviews/corsair/k100-rgb' },
  { cat: 'product', name: 'TH G502X review', url: 'https://www.tomshardware.com/reviews/logitech-g502-x-plus' },
  { cat: 'product', name: 'TH RTX 4090', url: 'https://www.tomshardware.com/reviews/nvidia-geforce-rtx-4090-review' },
  { cat: 'product', name: 'TH RTX 5090', url: 'https://www.tomshardware.com/reviews/nvidia-geforce-rtx-5090-review' },
  { cat: 'product', name: 'TH RX 9070 XT', url: 'https://www.tomshardware.com/reviews/amd-radeon-rx-9070-xt' },
  { cat: 'product', name: 'TPU Viper V3', url: 'https://www.techpowerup.com/review/razer-viper-v3-pro/' },
  { cat: 'product', name: 'TPU RTX 5090', url: 'https://www.techpowerup.com/review/nvidia-geforce-rtx-5090-founders-edition/' },
  { cat: 'product', name: 'PCMag AW2725DF', url: 'https://www.pcmag.com/reviews/dell-alienware-aw2725df' },
  { cat: 'product', name: 'HUB RTX 5090', url: 'https://www.youtube.com/watch?v=KgjQgAfV9Z0' },
  { cat: 'product', name: 'GN RTX 5090', url: 'https://www.youtube.com/watch?v=BmvGmKiHdv4' },
  { cat: 'product', name: 'Newegg RTX 4090', url: 'https://www.newegg.com/p/pl?d=rtx+4090' },
  { cat: 'product', name: 'Amazon RTX 5090', url: 'https://www.amazon.com/s?k=rtx+5090' },
  { cat: 'product', name: 'BestBuy RTX 5090', url: 'https://www.bestbuy.com/site/searchpage.jsp?st=rtx+5090' },
  { cat: 'product', name: 'Corsair M75', url: 'https://www.corsair.com/us/en/p/gaming-mouse/ch-931c111-na/' },
  { cat: 'product', name: 'SteelSeries Apex Pro', url: 'https://steelseries.com/gaming-keyboards/apex-pro-tkl-2023' },
  { cat: 'product', name: 'Keychron Q1 Pro', url: 'https://www.keychron.com/products/keychron-q1-pro-qmk-via-wireless-custom-mechanical-keyboard' },
  { cat: 'product', name: 'Wooting 60HE', url: 'https://wooting.io/wooting-60he' },
  { cat: 'product', name: 'BenQ Mobiuz', url: 'https://www.benq.com/en-us/gaming-monitor/ex2710u.html' },
  { cat: 'product', name: 'Samsung Odyssey', url: 'https://www.samsung.com/us/computing/monitors/odyssey/' },
  { cat: 'product', name: 'LG 27GP950', url: 'https://www.lg.com/us/monitors/lg-27gp950-b/' },
  { cat: 'product', name: 'Finalmouse ULX', url: 'https://finalmouse.com/' },
  { cat: 'product', name: 'Ninjutso Sora V2', url: 'https://ninjutso.com/' },
  { cat: 'product', name: 'Lamzu Atlantis', url: 'https://www.lamzu.com/' },
  { cat: 'product', name: 'Vaxee XE', url: 'https://vaxee.co/' },
  { cat: 'product', name: 'WLMouse Beast X', url: 'https://www.wlmouse.com/' },
  { cat: 'product', name: 'Zaunkoenig M2K', url: 'https://zaunkoenig.co/' },

  // ── ADDITIONAL RETAILERS / E-COMMERCE ──
  { cat: 'retailer', name: 'Walmart (monitor)', url: 'https://www.walmart.com/search?q=gaming+monitor+oled' },
  { cat: 'retailer', name: 'Walmart (keyboard)', url: 'https://www.walmart.com/search?q=mechanical+keyboard' },
  { cat: 'retailer', name: 'Walmart (GPU)', url: 'https://www.walmart.com/search?q=rtx+5090' },
  { cat: 'retailer', name: 'Target (keyboard)', url: 'https://www.target.com/s?searchTerm=gaming+keyboard' },
  { cat: 'retailer', name: 'HP Store', url: 'https://www.hp.com/us-en/shop/peripherals/mice-keyboards' },
  { cat: 'retailer', name: 'Lenovo', url: 'https://www.lenovo.com/us/en/accessories/keyboards-and-mice/' },

  // ── ADDITIONAL REVIEW SITES ──
  { cat: 'review', name: 'Jarrod\'sTech', url: 'https://jarrods.tech/' },
  { cat: 'review', name: 'Dave2D', url: 'https://www.youtube.com/@Dave2D' },
  { cat: 'review', name: 'MKBHD', url: 'https://www.youtube.com/@mkbhd' },
  { cat: 'review', name: 'LinusTechTips', url: 'https://www.youtube.com/@LinusTechTips' },
  { cat: 'review', name: 'Optimum Tech', url: 'https://www.youtube.com/@OptimumTech' },
  { cat: 'review', name: 'Badseed Tech', url: 'https://www.youtube.com/@BadSeedTech' },
  { cat: 'review', name: 'HotHardware', url: 'https://hothardware.com/' },
  { cat: 'review', name: 'Hexus', url: 'https://hexus.net/tech/reviews/' },
  { cat: 'review', name: 'eTeknix', url: 'https://www.eteknix.com/' },
  { cat: 'review', name: 'NeoWin', url: 'https://www.neowin.net/reviews/' },
  { cat: 'review', name: 'HWInfo', url: 'https://www.hwinfo.com/' },
  { cat: 'review', name: 'PCPer', url: 'https://pcper.com/' },
  { cat: 'review', name: 'TweakTown', url: 'https://www.tweaktown.com/reviews/' },
  { cat: 'review', name: 'WePC', url: 'https://www.wepc.com/' },
  { cat: 'review', name: 'GamingScan', url: 'https://www.gamingscan.com/' },

  // ── ADDITIONAL DATABASES ──
  { cat: 'database', name: 'GPUBoss', url: 'https://gpuboss.com/' },
  { cat: 'database', name: 'HLPlanet', url: 'https://hlplanet.com/' },
  { cat: 'database', name: 'LCDTech.info', url: 'https://lcdtech.info/' },
  { cat: 'database', name: 'DisplayHDR.org', url: 'https://displayhdr.org/' },

  // ── ADDITIONAL MANUFACTURER PRODUCT PAGES ──
  { cat: 'product', name: 'MSI RTX 5090', url: 'https://www.msi.com/Graphics-Card/GeForce-RTX-5090-SUPRIM-LIQUID-SOC-32G' },
  { cat: 'product', name: 'ASUS RTX 5090', url: 'https://www.asus.com/motherboards-components/graphics-cards/rog-strix/rog-strix-rtx5090-o32g-gaming/' },
  { cat: 'product', name: 'Gigabyte AORUS', url: 'https://www.gigabyte.com/Graphics-Card/GV-N509XAORUS-E-32GD' },
  { cat: 'product', name: 'Razer Huntsman V3', url: 'https://www.razer.com/gaming-keyboards/razer-huntsman-v3-pro-tenkeyless' },
  { cat: 'product', name: 'Corsair K100 RGB', url: 'https://www.corsair.com/us/en/Categories/Products/Gaming-Keyboards/Mechanical-Gaming-Keyboards/K100-RGB-Optical-Mechanical-Gaming-Keyboard/p/CH-912A01A-NA' },
  { cat: 'product', name: 'ASUS PG27AQDM', url: 'https://rog.asus.com/monitors/27-to-31-5-inches/rog-swift-oled-pg27aqdm/' },
  { cat: 'product', name: 'Dell AW2725DF', url: 'https://www.dell.com/en-us/shop/alienware-27-360hz-qd-oled-gaming-monitor-aw2725df/apd/210-bljj/monitors-monitor-accessories' },
  { cat: 'product', name: 'Samsung G9 OLED', url: 'https://www.samsung.com/us/computing/monitors/odyssey/49-odyssey-oled-g9-dqhd-240hz-0-03ms-gaming-monitor-ls49cg954snxza/' },
  { cat: 'product', name: 'LG OLED 42C4', url: 'https://www.lg.com/us/tvs/lg-oled42c4pua/' },

  // ── ADDITIONAL INTERNATIONAL ──
  { cat: 'international', name: 'OCUK Forums', url: 'https://forums.overclockers.co.uk/' },
  { cat: 'international', name: 'Hardware.info', url: 'https://nl.hardware.info/' },
  { cat: 'international', name: 'Tweakers.net', url: 'https://tweakers.net/' },
  { cat: 'international', name: 'ComputerBase.de', url: 'https://www.computerbase.de/' },
  { cat: 'international', name: 'Les Numériques', url: 'https://www.lesnumeriques.com/' },
  { cat: 'international', name: 'Clubic.com', url: 'https://www.clubic.com/' },
  { cat: 'international', name: 'HardwareZone SG', url: 'https://www.hardwarezone.com.sg/' },
  { cat: 'international', name: 'GeizhalsDE', url: 'https://geizhals.de/' },
  { cat: 'international', name: 'IdealoDE', url: 'https://www.idealo.de/' },

  // ── ADDITIONAL NEWS / POPUP-HEAVY ──
  { cat: 'news', name: 'Slate', url: 'https://slate.com/' },
  { cat: 'news', name: 'The Atlantic', url: 'https://www.theatlantic.com/technology/' },
  { cat: 'news', name: 'Quartz', url: 'https://qz.com/' },
  { cat: 'news', name: 'Inc.com', url: 'https://www.inc.com/' },
  { cat: 'news', name: 'Fast Company', url: 'https://www.fastcompany.com/technology' },
];

// ═══════════════════════════════════════════════════════════════════════
// Audit function — mirrors real plugin behavior
// ═════════════════════════════════════════════════════════���═════════════
async function auditSite(browser, site) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  const startMs = Date.now();

  try {
    // Layer 0: Block CMP domains
    await page.route('**/*', (route) => {
      const url = route.request().url().toLowerCase();
      if (CMP_DOMAINS.some((d) => url.includes(d))) return route.abort();
      return route.continue();
    });

    // Layer 1: CSS + observer + CMP stubs (before goto)
    await page.addInitScript(INIT_SCRIPT);

    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Cookie consent
    let cookieClicked = 0;
    for (const sel of COOKIE_SELECTORS) {
      try {
        const btns = await page.locator(sel).all();
        for (const btn of btns) {
          if (!(await btn.isVisible().catch(() => false))) continue;
          await btn.click({ timeout: 1500 });
          cookieClicked++;
          break;
        }
        if (cookieClicked > 0) break;
      } catch {}
    }

    // Layer 2a: Targeted selector removal (catches CSS specificity losers)
    try {
      await page.evaluate(() => {
        const KILL = [
          '#cookie-policy-info', '#onetrust-banner-sdk', '#shopify-pc__banner',
          '.cc-window', '.cc-banner', '[class*="sd-cmp"]', '[class*="evidon"]',
          '[class*="adnsticky"]', '[class*="cmplz-cookiebanner"]',
          '[class*="didomi-popup"]', '[class*="qc-cmp"]',
          '[class*="reminder-info"]', '[class*="bluecore"]',
          '[class*="nomask"]', '[class*="region-popup"]',
          '[class*="gg-overlay"]',
        ];
        for (const sel of KILL) {
          for (const el of document.querySelectorAll(sel)) {
            if (el.tagName === 'NAV' || el.tagName === 'HEADER') continue;
            el.remove();
          }
        }
      });
    } catch {}

    // Layer 2b: Heuristic overlay scan + removal
    let overlaysRemoved = 0;
    try {
      const detected = await page.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const res = [];
        for (const el of document.querySelectorAll('*')) {
          const s = window.getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          if (s.position !== 'fixed' && s.position !== 'absolute') continue;
          if (el.tagName === 'NAV' || el.tagName === 'HEADER') continue;
          const z = parseInt(s.zIndex, 10);
          if (isNaN(z) || z < 500) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 100 || r.height < 40) continue;
          if ((r.width * r.height) / (vw * vh) < 0.15) continue;
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

    // Layer 3: Scroll-lock
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

    // Observer telemetry
    let observerCaught = 0;
    try {
      const guard = await page.evaluate(() => window.__sfOverlayGuard);
      observerCaught = guard?.caught ?? 0;
    } catch {}

    // Post-dismissal scan
    const popupsAfter = await page.evaluate(() => {
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
        const text = (el.innerText || '').slice(0, 60).replace(/\n/g, ' ');
        res.push({ z, cov, text, id: el.id || '', class: cls.slice(0, 40) });
      }
      return res.sort((a, b) => b.z - a.z).slice(0, 3);
    });

    const elapsedMs = Date.now() - startMs;
    const urlStable = page.url().includes(new URL(site.url).hostname);

    return { cookieClicked, overlaysRemoved, scrollLock, observerCaught, popupsAfter, urlStable, elapsedMs, error: null };
  } catch (err) {
    return { cookieClicked: 0, overlaysRemoved: 0, scrollLock: false, observerCaught: 0, popupsAfter: [], urlStable: false, elapsedMs: Date.now() - startMs, error: err.message?.slice(0, 60) };
  } finally {
    await context.close().catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Parallel batch execution
// ═══════════════════════════════════════════════════════════════════════
async function runBatch(browser, sites, concurrency = 5) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < sites.length) {
      const i = index++;
      const site = sites[i];
      process.stdout.write(`  [${String(i + 1).padStart(3)}/${sites.length}] ${site.name.padEnd(28)} `);
      const r = await auditSite(browser, site);
      r.name = site.name;
      r.cat = site.cat;
      results.push(r);

      if (r.error) {
        console.log(`ERROR (${r.elapsedMs}ms): ${r.error}`);
      } else {
        const afterCount = r.popupsAfter.length;
        const status = afterCount === 0 ? 'CLEAN' : 'REMAINING';
        console.log(
          `ck=${r.cookieClicked} ov=${r.overlaysRemoved} obs=${r.observerCaught}`,
          `scroll=${r.scrollLock ? 'FIX' : 'ok'} after=${afterCount}`,
          `url=${r.urlStable ? 'ok' : 'CHG'} ${r.elapsedMs}ms ${status}`,
        );
        if (afterCount > 0) {
          for (const p of r.popupsAfter) {
            console.log(`      z=${p.z} cov=${p.cov}% "${p.text.slice(0, 45)}" class=${p.class.slice(0, 25)}`);
          }
        }
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════
async function main() {
  console.log('='.repeat(90));
  console.log(`  300-Site Fetch Plugin Suite Audit — ${SITES.length} targets`);
  console.log('='.repeat(90));
  console.log();

  const browser = await chromium.launch({ headless: true });
  const allResults = await runBatch(browser, SITES, 5);
  await browser.close();

  // ── Category summary ──
  const cats = [...new Set(SITES.map((s) => s.cat))];
  console.log();
  console.log('='.repeat(90));
  console.log('  CATEGORY SUMMARY');
  console.log('='.repeat(90));

  let totalClean = 0, totalRemaining = 0, totalErrors = 0;
  for (const cat of cats) {
    const catResults = allResults.filter((r) => r.cat === cat);
    const clean = catResults.filter((r) => !r.error && r.popupsAfter.length === 0).length;
    const remaining = catResults.filter((r) => !r.error && r.popupsAfter.length > 0).length;
    const errors = catResults.filter((r) => r.error).length;
    const avgMs = Math.round(catResults.reduce((s, r) => s + r.elapsedMs, 0) / catResults.length);
    totalClean += clean;
    totalRemaining += remaining;
    totalErrors += errors;
    console.log(`  ${cat.padEnd(16)} ${String(catResults.length).padStart(3)} sites | ${String(clean).padStart(3)} clean | ${String(remaining).padStart(2)} remaining | ${String(errors).padStart(2)} errors | avg ${avgMs}ms`);
  }

  console.log();
  console.log('='.repeat(90));
  console.log(`  TOTAL: ${totalClean} clean, ${totalRemaining} remaining popups, ${totalErrors} errors out of ${SITES.length} sites`);
  console.log(`  CLEAN RATE: ${Math.round(totalClean / (SITES.length - totalErrors) * 100)}% (excluding errors)`);
  console.log('='.repeat(90));

  // ── Remaining popups detail ──
  const misses = allResults.filter((r) => !r.error && r.popupsAfter.length > 0);
  if (misses.length > 0) {
    console.log();
    console.log('  REMAINING POPUPS (need new selectors):');
    for (const m of misses) {
      console.log(`    ${m.name} [${m.cat}]:`);
      for (const p of m.popupsAfter) {
        console.log(`      z=${p.z} cov=${p.cov}% "${p.text.slice(0, 50)}" class=${p.class}`);
      }
    }
  }

  // ── Errors detail ──
  const errs = allResults.filter((r) => r.error);
  if (errs.length > 0) {
    console.log();
    console.log('  ERRORS:');
    for (const e of errs) {
      console.log(`    ${e.name} [${e.cat}]: ${e.error}`);
    }
  }

  // ── Performance outliers ──
  const sorted = [...allResults].filter((r) => !r.error).sort((a, b) => b.elapsedMs - a.elapsedMs);
  if (sorted.length > 0) {
    console.log();
    console.log('  SLOWEST 10:');
    for (const r of sorted.slice(0, 10)) {
      console.log(`    ${r.name.padEnd(28)} ${r.elapsedMs}ms`);
    }
  }
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
