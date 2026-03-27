# Crawl System Audit Report (2026-03-27)

## Executive Summary

Full audit of the Crawlee fetch pipeline across 20+ completed runs and 30+ live crawl attempts. Identified **12 distinct behavioral issues** with root causes and recommended fixes.

**Critical finding:** Pages that successfully loaded (proven by video recordings + screencast frames) are being classified as `failed`, inflating the error rate by ~15-25%. The GUI then displays error badges for workers that actually retrieved usable content.

---

## Issue Catalog

### ISSUE 1: Timeout-classified workers have loaded pages (CRITICAL)

**Symptom:** Worker shows `failed` state with "requestHandler timed out after 45 seconds" but the screencast frame shows the page fully rendered and the video recording confirms content loaded.

**Evidence:**
- Run `20260327035611-b58cdc` (Logitech G Pro X Superlight 2):
  - `fetch-3` (Amazon): state=`failed`, error="requestHandler timed out", screencast=69KB (real page), video=3.5MB
  - `fetch-17` (Tom's Hardware): state=`failed`, error="requestHandler timed out", screencast=51KB, video=3.3MB
- Observed in 4+ of 20 analyzed runs. Typical hosts: Amazon, Target, Walmart, forums

**Root cause:** The 45-second `requestHandlerTimeoutSecs` fires AFTER the page loads but BEFORE the plugin hooks (cookie consent, auto-scroll, DOM expansion, CSS override, screenshot capture) complete. The page navigation succeeds in ~5-15s, but the subsequent plugin chain adds:
- Cookie consent: up to 5s (autoconsent timeout) + 1s settle
- Auto-scroll: multiple passes with delays
- DOM expansion: up to 50 clicks with 1.5s settle
- CSS override: page evaluation
- Screenshot capture: full-page + crops

Total overhead: 10-20s of post-navigation processing. When the page was slow to navigate (e.g., Amazon at 20s), the remaining 25s isn't enough for all plugins.

**Impact:** ~15-25% of "failed" workers actually have usable HTML content. The GUI shows a red error badge, but videos/screenshots show the content loaded fine.

**Fix recommendation:**
1. Check if HTML was captured before the timeout fired. If `page.content()` returned >200 bytes, classify as `crawled_partial` instead of `failed`.
2. Increase `requestHandlerTimeoutSecs` to 60-75s (currently 45s code default, registry suggests 45s).
3. Make plugin chain timeout-aware: skip non-essential plugins (auto-scroll, DOM expansion) when <15s remains.

---

### ISSUE 2: BestBuy always fails with ERR_HTTP2_PROTOCOL_ERROR

**Symptom:** Every BestBuy URL fails with `page.goto: net::ERR_HTTP2_PROTOCOL_ERROR`.

**Evidence:**
- Run `20260327035611-b58cdc`: `fetch-4` and `fetch-12` both BestBuy, both ERR_HTTP2
- Observed in 100% of runs containing BestBuy URLs

**Root cause:** BestBuy's CDN aggressively terminates HTTP/2 connections from automated browsers. The Chromium browser detects the protocol-level reset and throws before the page can load.

**Impact:** BestBuy URLs (a major retailer) are completely uncrawlable.

**Fix recommendation:**
1. Add BestBuy to a domain-specific config that forces HTTP/1.1 via Playwright launch args: `--disable-http2`
2. Or add BestBuy to a known-incompatible domain list and skip preemptively

---

### ISSUE 3: Reddit always triggers CAPTCHA detection

**Symptom:** Every Reddit URL is classified as `captcha` with "blocked:captcha_detected".

**Evidence:**
- Run `20260327035611-b58cdc`: `fetch-20` (Reddit), state=captcha
- Run `20260327034619-54cc66`: 4 Reddit URLs, all captcha
- Observed in 100% of runs

**Root cause:** Reddit requires login for most content and serves a challenge/interstitial page. The `classifyBlockStatus` function detects `captcha` markers in the HTML. Session rotation does not help because Reddit requires authentication, not just a new fingerprint.

**Impact:** Reddit URLs (a major source of user reviews/discussions) are completely uncrawlable.

**Fix recommendation:**
1. Add `www.reddit.com` to a pre-classified blocked domain list. Skip at search result triage time instead of wasting a fetch slot + 45s timeout + retry.
2. Consider using Reddit's JSON API (`/r/subreddit/comments/id.json`) as an alternative data source.

---

### ISSUE 4: Manufacturer download links cause "Download is starting" failures

**Symptom:** Worker fails with "page.goto: Download is starting" when the URL points to a PDF, driver download, or asset file.

**Evidence:**
- Run `20260327035611-b58cdc`: `fetch-1` (Logitech PDF asset), state=failed
- Run `20260326062455-f5d5fc`: `fetch-?` (dl.razerzone.com), download error
- Run `20260326072251-cec006`: 2x cougargaming.com download errors

**Root cause:** Some manufacturer URLs (product datasheets, driver downloads) serve a file download response instead of HTML. Playwright's `page.goto()` detects the download and throws.

**Impact:** Wastes a fetch slot for 5-10s before failing. Common for: cougargaming.com (8 downloads), dl.razerzone.com, Logitech asset URLs.

**Fix recommendation:**
1. Pre-filter URLs at search result triage: reject URLs containing `/assets/`, `/downloads/`, `/drivers/`, file extensions `.pdf`, `.zip`, `.exe`, `.dmg`.
2. In `errorHandler`, mark download errors as `noRetry = true` (already done).
3. Consider using content-type pre-check via HTTP HEAD before full page load.

---

### ISSUE 5: Always-blocked domains waste fetch slots

**Symptom:** Certain domains always return 403 or block detection across every run.

**Evidence (aggregated across 20 runs):**
| Domain | Attempts | Success | Failure | Reason |
|--------|----------|---------|---------|--------|
| shop.asus.com | 3 | 0 | 3 | blocked (403) |
| centralcomputer.com | 2 | 0 | 2 | blocked (403) |
| deskhero.ca | 8 | 0 | 8 | timeout |
| igorslab.de | 8 | 0 | 8 | unknown |
| razer.com | 6 | 0 | 6 | unknown |
| geizhals.de | 3 | 0 | 3 | unknown |
| weltransim.eu | 3 | 0 | 3 | unknown |
| pcbuilder.net | 3 | 0 | 3 | unknown |
| stuff.tv | 3 | 0 | 3 | unknown |
| techgearlab.com | 3 | 0 | 3 | unknown |

**Root cause:** These domains either block all automated traffic (403), require specific geo-IP, or have aggressive anti-bot measures that never succeed even with retries.

**Impact:** 8 fetch slots x 45s handler timeout = 6 minutes wasted per run on domains that will never succeed.

**Fix recommendation:**
1. Maintain a `knownBlockedDomains` list in settings (or auto-populate from historical fail rate).
2. At search result triage, de-prioritize or hard-drop URLs from known-blocked domains.
3. Track per-domain success rate in the frontier DB and auto-add domains with 100% fail rate across 3+ runs.

---

### ISSUE 6: Run timeout leaves workers in "queued" state

**Symptom:** Runs that hit the 7-minute overall timeout have 20-30 workers stuck in `queued` state, never processed.

**Evidence:**
- Run `20260327040458-eda8bb` (Razer DeathAdder): 16 fetched, 24 queued (60% never processed)
- Common pattern: search discovers 30-40 URLs but only 8-16 get fetched before timeout

**Root cause:** The pipeline discovers more URLs than can be fetched within the time budget. With 8 concurrent slots and 45s handler timeout, max throughput is ~10 URLs/minute. A typical run discovers 30-40 URLs but the 7-minute budget allows only 15-20 fetches.

**Impact:** Half the discovered URLs are never fetched, reducing data coverage.

**Fix recommendation:**
1. Prioritize URLs by domain reliability score (use historical success rates).
2. De-prioritize known-slow domains (Amazon, Target) and known-blocked domains.
3. Consider reducing handler timeout to 30s for non-critical URLs.
4. Implement a dynamic batch scheduler that adjusts batch size based on remaining time.

---

### ISSUE 7: pcpartpicker.com has 79% failure rate but is frequently selected

**Symptom:** pcpartpicker.com URLs are selected by search but fail 79% of the time.

**Evidence:** 24 total fetches, only 5 successful (79% fail). Multiple regional variants (it.pcpartpicker.com: 100% fail, de.pcpartpicker.com: 50% fail, ca.pcpartpicker.com: 67% fail).

**Root cause:** pcpartpicker.com has aggressive bot protection that varies by region. The site works inconsistently with different sessions/fingerprints.

**Fix recommendation:**
1. Downweight pcpartpicker.com and regional variants in the search result triage scoring.
2. Prefer the main `pcpartpicker.com` domain over regional subdomains.

---

### ISSUE 8: Corsair.com shows "crawled" state but has HTTP 403 error

**Symptom:** corsair.com workers show state=`crawled` with last_error="HTTP 403". The GUI displays a success state but has an error message.

**Evidence:** 177 total fetches to corsair.com: 110 "crawled" with HTTP 403, 61 queued, 6 stuck.

**Root cause:** Corsair returns a 403 status code but still serves HTML content (their block page contains enough HTML to pass the `classifyBlockStatus` check). The worker pool builder sets state=`crawled` first, then checks the status code. Since the error field is "HTTP 403" (not starting with "blocked:"), the state override logic at line 363-390 of `runtimeOpsWorkerPoolBuilders.js` should catch it, but the status code from the `fetch_finished` event may not carry the 403.

**Impact:** Workers appear successful in the GUI but the content is actually a Corsair block page, not the product data.

**Fix recommendation:**
1. Investigate why corsair.com 403 responses aren't being caught by `classifyBlockStatus` - the status-based check at line 42 should catch `s === 403`.
2. The issue may be in the event chain: if `source_processed` fires instead of `fetch_finished`, the status might be lost.

---

### ISSUE 9: No screencast frame in GUI for completed runs (video available)

**Symptom:** The GUI "Browser Stream" panel shows no live frame after a run completes, even though video recordings exist.

**Evidence:** For run `20260327035611-b58cdc`, all screencast frames return 200 from the API but the response wraps the frame in `{ run_id, worker_id, frame: {...} }`. However, the GUI's `BrowserStream` component may not handle this envelope correctly for stored runs.

**Root cause:** Two-part:
1. During a live run, CDP screencast streams frames in real-time via WebSocket. After run completion, the bridge calls `persistAllScreencastFrames()` which saves the last frame per worker to disk.
2. The API reads persisted frames correctly, but the GUI `BrowserStream.tsx` may only show the retained frame during the live stream, not after run completion when it falls back to the video endpoint.

**Fix recommendation:**
1. Verify `BrowserStream.tsx` correctly loads the retained frame from `/runtime/screencast/{workerId}/last` for stored runs.
2. Ensure the frame envelope `{ frame: { data, width, height } }` is correctly parsed.

---

### ISSUE 10: High-value sites (Amazon, Walmart, Target) consistently timeout

**Symptom:** Amazon, Walmart, Target URLs timeout ~50-80% of the time.

**Evidence:**
- Amazon: timeout errors in multiple runs, pages load (video proves it) but handler times out
- Target: timeout in run `20260327034619-54cc66`
- Walmart: timeout in multiple runs

**Root cause:** These sites are slow to fully render (heavy JavaScript SPAs). They load enough content to render a screencast frame but the full plugin chain (cookie consent + scroll + extraction) pushes past the 45s limit.

**Impact:** Major e-commerce data sources are frequently lost.

**Fix recommendation:**
1. For known-slow SPA sites, use a "fast path" plugin profile: skip auto-scroll, DOM expansion. Just capture HTML + screenshot.
2. Increase handler timeout specifically for these domains.
3. Use `page.waitForLoadState('networkidle')` ONLY for these sites (currently using 'domcontentloaded' which fires fast but doesn't wait for async content).

---

### ISSUE 11: Retry logic is wasteful - blocked domains always block

**Symptom:** Retries never convert blocked domains to successful fetches.

**Evidence:** Across all analyzed runs, no observed case where a retry (session rotation) or proxy retry successfully fetched a previously-blocked URL. The 1 native retry + proxy retry adds up to 90s wasted per blocked URL.

**Root cause:** Domains that block do so based on behavior patterns (CDN-level, Cloudflare), not session cookies. Rotating fingerprints and sessions doesn't help against CDN-level blocks.

**Fix recommendation:**
1. Reduce `maxRequestRetries` to 0 for domains in the known-blocked list.
2. For domains with historical block rate > 80%, skip the native retry entirely.
3. Remove proxy retry pass for domains that block at the CDN level (403, Cloudflare challenge).

---

### ISSUE 12: "stuck" workers from Crawlee request handler deadlock

**Symptom:** Workers show `stuck` state with pulse animation indefinitely.

**Evidence:** 6 stuck workers for corsair.com, 6 for razer.com in historical runs.

**Root cause:** The `stuck` detection fires when a worker has been in `running`/`crawling` state longer than `handlerTimeoutSecs - 5`. This happens when the Crawlee request handler is in a deadlocked state (e.g., waiting for a page.evaluate that never resolves, or a CDP session that's hung).

**Impact:** Stuck workers consume a concurrent slot permanently, reducing throughput for remaining URLs.

**Fix recommendation:**
1. Add a hard kill timeout at `handlerTimeoutSecs + 10` that forcefully resolves the pending entry and retires the page.
2. Monitor for stuck workers and log which plugin hook was executing when the worker became stuck.

---

## Aggregate Statistics (20 Analyzed Runs)

| Metric | Value |
|--------|-------|
| Total runs analyzed | 20 |
| Total fetch workers created | ~650 |
| Avg fetches per run | ~22 |
| Avg error rate | 30-40% |
| Most common error | Timeout (35% of errors) |
| Second most common | Captcha/Block (25% of errors) |
| Third most common | HTTP/2 protocol error (15% of errors) |
| Fourth most common | Download redirect (10% of errors) |
| Domains with 100% fail rate | 16 unique domains |
| Estimated wasted fetch time per run | ~3-4 minutes (of ~5min total) |

## Domain Reliability Tiers

### Tier 1: Reliable (>80% success)
rog.asus.com, us.maxgaming.com, gigaparts.com, pcmag.com, wepc.com, versus.com, steelseries.com

### Tier 2: Mostly reliable (50-80%)
techpowerup.com (73%), rtings.com (71%), newegg.com (80%), finalmouse.com (79%), asus.com (83%)

### Tier 3: Flaky (20-50%)
corsair.com (62%), eloshapes.com (58%), cougargaming.com (58%), tweaktown.com (67%)

### Tier 4: Mostly broken (<20%)
pcpartpicker.com (21%), lttlabs.com (43%), tomshardware.com (39%), tomsguide.com (14%)

### Tier 5: Always blocked (0%)
shop.asus.com, centralcomputer.com, deskhero.ca, igorslab.de, razer.com (main), geizhals.de, Reddit, BestBuy

---

## Recommended Priority Fixes

1. **[HIGH] Timeout-as-failure misclassification** - Check for captured HTML before classifying timeout as failure. Biggest impact on data quality.
2. **[HIGH] Known-blocked domain list** - Skip known-blocked domains at triage time. Biggest impact on throughput.
3. **[HIGH] Download URL pre-filter** - Reject download/asset URLs before fetching. Easy win.
4. **[MED] Domain-specific handler timeout** - Longer for slow retail sites, shorter for always-blocked sites.
5. **[MED] Plugin chain timeout awareness** - Skip non-essential plugins when time is short.
6. **[MED] BestBuy HTTP/2 workaround** - Force HTTP/1.1 or add to block list.
7. **[LOW] GUI screencast frame loading** - Fix frame envelope parsing for stored runs.
8. **[LOW] Auto-populate blocked domain list** - Track per-domain success rate across runs.
