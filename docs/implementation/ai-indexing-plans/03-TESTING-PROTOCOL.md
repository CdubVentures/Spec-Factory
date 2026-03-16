# 03-TESTING-PROTOCOL.md — 10-Phase Validation with Progressive Proof

**Scope:** Phases 01–03 and 05–09 test the **Collection Pipeline** (searching, fetching, parsing, extracting, storing). Phase 04 (Core/Deep Gates) and later comparison/publish testing cover the **Review Phase**, which is a separate process implemented after the collection pipeline is proven.

**Aligned with AGENTS.md.** Every phase follows: CONTRACT → CHARACTERIZATION → MACRO-RED → MACRO-GREEN → REFACTOR → LIVE-VALIDATION. Max 3 attempts per failing test before `[STATE: BLOCKED]`. No phase drift — current gate must be green before next phase begins.

---

## Live Run Mandate

Agents are **pre-authorized** to start the real server, open the real browser, trigger real product runs with real search/fetch/LLM, and spend real API tokens. No asking permission. No "let me check what's needed." Start the server. Run the product. Watch it. Record evidence. See `LIVE-RUN-PROTOCOL.md`.

**Banned agent phrases:** "Let me check what's needed," "I'll need to verify the environment," "Should I proceed with a live run?" "The unit tests pass so the live behavior should…" Delete the sentence. Run the test instead.

---

## Phase 01 — CI Stabilization (Week 1)

**Release blockers. Nothing else starts until green.**

### CP-0: GUI Lane Contract Timeout

Characterize first: capture exact failing selector, timeout duration, DOM state at failure.

| ID | Test | Pass When |
|---|---|---|
| CP0-01 | Category dropdown renders options | Visible within 2s |
| CP0-02 | Selection triggers panel update | Downstream panel changes |
| CP0-03 | No console errors | Zero errors in DevTools |
| CP0-04 | 10x local stability | 10/10 pass |
| CP0-05 | Full suite regression | `npm test` → 0 failures |

### CP-1: Repair Queue Handoff

Characterize first: trace where `repair_query_enqueued` signal drops.

| ID | Test | Pass When |
|---|---|---|
| CP1-01 | Event emission | Correct payload emitted |
| CP1-02 | Queue insertion | AutomationQueue row created with dedupe key |
| CP1-03 | Worker pickup | Task transitions to `running` |
| CP1-04 | Worker completion (success) | Terminal `completed` state |
| CP1-05 | Worker completion (failure) | Terminal `failed` after retries |
| CP1-06 | Dedupe enforcement | Duplicate signal → single row |
| CP1-07 | Backoff enforcement | Failed task respects schedule |
| CP1-08 | TTL enforcement | Expired task not retried |
| CP1-09 | E2E proof | Signal → queue → worker → terminal in one test |
| CP1-10 | 5x stability | 5/5 pass |

**Live proof:** Real server, trigger URL failure, watch queue inspection API, watch worker drawer, capture screenshots.

**Exit gate:** CP0-01–05 + CP1-01–10 all green. Full suite 0 failures. Live proof captured.

---

## Phase 02 — SourceRegistry (Week 2)

Characterize first: freeze current dot-only hint behavior per token type before public-suffix aware host parsing is swapped in.

| ID | Test | Pass When |
|---|---|---|
| SR-01–08 | Schema validation | Valid passes, invalid rejected, duplicates caught, CI enforced |
| HP-01–08 | Host parsing | URLs stripped, punycode normalized, `v2.0` rejected, ports stripped |
| TE-01–07 | Tier expansion | Each tier returns correct hosts, empty tier = empty array not crash |
| PE-01–05 | Policy enforcement | `connector_only` excluded, `blocked_in_search` excluded, pacing respected |
| REG-01–02 | Flag off regression | Identical to characterization baseline |

**Population hard gate:** 20+ entries per category, 3+ tiers, 2+ manufacturer, 2+ retailer, 1+ lab. Automated CI check.

**Exit gate:** All tests green. 3 categories populated. Population gate enforced. Live server proof: tier expansion returns real hosts.

---

## Phase 03 — QueryCompiler (Week 2–3)

Characterize first: freeze current queryBuilder output for 5 products.

| ID | Test | Pass When |
|---|---|---|
| PC-01–05 | Provider capabilities | All providers present, unknown throws, booleans strict, CI validates |
| QC-01–11 | Compiler logic | `site:` when supported, lexical fallback when not, truncation, determinism |
| GT-01–07+ | Golden tests | 3+ per provider, frozen output, CI merge-blocking |
| FB-01–04 | Fallback behavior | Rejected operators retry lexical, rate-limit backoff, empty = logged |
| REG-01–03 | Integration | Flag off = legacy, `connector_only` excluded, `blocked_in_search` excluded |

**Live proof:** Real queries against real providers. Verify operators actually affect result sets.

**Exit gate:** All tests green. Golden tests in CI. Real query results captured per provider.

---

## Phase 04 — Core/Deep Gates (Week 3)

Characterize first: run 3 products without gates, record fill rate and tier-per-field.

| ID | Test | Pass When |
|---|---|---|
| FC-01–08 | Field classification | Zero unclassified, no dual-classified, 20+ spot-checked |
| TA-01–09 | Tier acceptance | Tier1/2 accepted, Tier3 needs corroboration, Tier4 rejected for core |
| COP-01–04 | Community override prevention | Tier4 cannot set/overwrite core facts, volume does not upgrade tier |
| DC-01–04 | Deep claims | Full metadata stored, conflicting claims both kept, confidence ranked |
| CL-01–04 | Claim clustering | Median/range, outlier detection, single value, wide spread |
| REG-01–03 | Flag off regression | No behavior change, rejections logged |

**Critical measurement:** Fill rate impact: gates OFF vs ON. If > 20% drop, tune thresholds before shipping.

**Exit gate:** All tests green. Community override proven impossible. Fill rate impact documented and acceptable.

---

## Phase 05 — DomainHintResolver v2 (Week 3–4)

Characterize first: extend Phase 02 baseline with mixed-token hint sets.

Phase 05 proof is about a non-null `EffectiveHostPlan` artifact and recorded `HostHealth` ladder decisions, not just token parsing in isolation.

| ID | Test | Pass When |
|---|---|---|
| TC-01–13 | Token classification | Hosts, tiers, intents, unresolved — all correctly classified, zero silent drops |
| PL-01–05 | Plan completeness | All fields present, deterministic, order-independent, explain populated |
| HL-01–06 | Health ladder | Downrank default, exclude on severe, auto-relax on zero yield, every exclusion logged |
| DB-01–03 | Diversity budgets | Multiple host groups, budget capping, single-host still valid |
| NG-01–03 | Negative guards | No silent drops, connector_only excluded, blocked excluded |
| REG-01 | Flag off | Characterization baseline preserved |

**Side-by-side diff logging starts on day one of this phase.** Wire old and new resolver in parallel. Log every diff.

**Exit gate:** All tests green. Domain panel `0/Y` eliminated. Diff logging active.

---

## Phase 06 — QueryBuilder Integration + 20-Product Gate (Week 4)

Characterize first: freeze queryBuilder output for 5 baseline products (old path).

| ID | Test | Pass When |
|---|---|---|
| SC-01–09 | Scoring engine | All 5 signals present, deterministic, edge cases handled |
| SW-01–05 | Swap regression | Flag off = exact baseline, flag on = new hosts + intents in queries |
| UI-01–07 | UI panels | Query Journey ranked + scored, Unresolved Tokens, Host Plan, Host Health |
| G20-01–05 | 20-product gate | 15% fill improvement, wrong-value within 2%, zero products worse, 0/Y eliminated, explain on all 20 |

**This is the hard go/no-go.** Run 20 products across 3 categories, old vs new. Every metric measured. If any G20 test fails, do not enable in production.

**Exit gate:** All tests green. 20-product comparison matrix completed. Aggregate gate proof documented.

---

## Phase 07 — Instrumentation (Weeks 4–5)

Characterize first: baseline searches/product and URLs/product without indexes.

| ID | Test | Pass When |
|---|---|---|
| QI-01–06 | QueryIndex capture | Row per query, provider, result count, yield attribution, no silent write failures |
| UI-01–09 | URLIndex capture | Row per URL, status, tier, fields filled, high-yield tag, TTL, revalidation |
| PI-01–05 | PromptIndex capture | Row per LLM call, version, yield, error, cost |
| CL-01–04 | Compound learning | Searches decrease across sequential runs, URLIndex consulted, QueryIndex consulted |
| REG-01–02 | Flag off | No behavior change, no performance regression on first run |

**Critical proof:** Run 10 products same category. Searches/product must decrease by run 5. If flat, indexes are not being consulted.

**Exit gate:** Compound learning proven with measured trend. Dashboard metrics verified.

---

## Phase 08 — Production Rollout (Weeks 5–6)

Characterize first: freeze pre-rollout production metrics.

| ID | Test | Pass When |
|---|---|---|
| RB-01–04 | Rollback | Full rollback tested, < 2 min, no data corruption, pre-v2 behavior restored |
| SK-01–07 | 48-hour soak | Error rate, fill rate, run time, memory, queue depth, restarts — all within tolerance |
| PR-01–04 | Production defaults | Single production default profile active (preset system retired 2026-03-09); verify aggressive + uber-aggressive always-on, 14 aggressive knobs load correct values |
| DS-01–05 | Default sync | Config, server, UI, fresh session, stale overrides — all aligned |

**Staged rollout:** Registry → Compiler → Gates → Resolver → Indexes. Each stage: 3 products, 4 hours monitoring, rollback trigger defined.

**Exit gate:** All 5 stages completed. 48h soak passed. Defaults promoted. Settings synced. Single production default profile validated.

---

## Phase 09 — Visual Pipeline + Parsing (Weeks 6–8, parallel)

| ID | Test | Pass When |
|---|---|---|
| VC-01–05 | Visual capture | Manifest with deterministic IDs, derivatives, schema complete |
| QG-01–07 | Quality gates | Resolution/blur/completeness gates, target-match gate, failures excluded |
| OC-01–07 | Image OCR | Region candidates with bbox/confidence, only gated assets processed |
| VR-01–03 | Visual refs | Ambiguous fields get refs, clear fields don't, no-screenshot = text-only |
| P07-01–04 | Scanned PDF preprocess | Deskew/denoise/binarize improve accuracy, fixture suite proves it |
| P09-01–05 | Chart extraction | Ordered stack: payload → config → SVG → vision fallback |
| P10-01–05 | Office docs | DOCX/XLSX/PPTX router, correct parser per type, normalized output |
| EA-01–04 | Evidence anchoring | Content hash, offset/span, context window, anchor resolves on re-fetch |

**Parse coverage audit:** For every live run, record all 10 phases + counts. Zero-count phases must be explained.

Phase 09 is not green unless `evidence quote anchoring` is captured in a way that survives re-fetch and trace review.

**Exit gate:** All tests green. 5-product parse coverage audit completed.

---

## Phase 10 — Acceleration + Go/No-Go (Weeks 8–10+)

| ID | Test | Pass When |
|---|---|---|
| TG-01–06 | Throughput gate | 15+ products/day for 7 days, < 8 min avg, < $0.50 LLM, 95% success, 0 crashes |
| EL-01–06 | Escalation ladder | Pass 1 targets authority first, Pass 2 on gap trigger, Pass 3 only when justified |
| CT-01–04 | Compound trends | Searches decreasing, URL reuse increasing, citation time decreasing over 7 days |
| CI-01–06 | Community ingestion | Reddit connector, Tier4 classification, claims not facts, core override prevention |
| KT-01–03 | Knob telemetry | Effective values in run artifacts, audit trail across runs |
| NL-01–02 | NeedSet lineage | Snippet timestamps, GUI age sort |
| LA-01–06 | Local AI readiness | Pipeline works without it, endpoint responds, schema validates, queue handles saturation |

**Go criteria:** All TG tests green, compound trends proven, escalation ladder proven on 5 products, community verified safe.

`local helper AI` stays behind its own bounded readiness gate: advisory-only outputs, no new hosts, and identical behavior when disabled.

**No-go triggers:** Throughput < 12/day, wrong-value > 8%, server instability, fill regression, community corrupts core facts.

**Final verdict:** GO = proceed to capability expansion. NO-GO = fix what blocks it, re-run Phase 10.
