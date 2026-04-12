# AI Indexing Plans Reference

Related: [Implementation Reference](../README.md) | [IndexLab](../../04-features/indexing-lab.md) | [Pipeline And Runtime Settings](../../04-features/pipeline-and-runtime-settings.md)

This subtree contains pipeline documentation, per-stage contracts, and planning artifacts.

## Two-Phase Architecture (post rework 2026-03-24)

**Phase A — Discovery Pipeline (stages 01–08).** Searches the web for product URLs, classifies them, and seeds the planner queue. Uses LLM calls for brand resolution, search profile generation, and SERP triage. Unchanged from the original design.

**Phase B — Crawl Pipeline (replaces old stages 09–13).** A single Crawlee-based crawler opens pages, runs plugins (stealth, scroll, screenshot), classifies blocks, and records results to the frontier DB. Parsing/extraction tools will be added as plugins. ~24,000 LOC of old extraction/consensus/finalization code was removed.

## Active Documentation

### Pipeline Contracts (stages 01–08 — discovery)
- [Prefetch Pipeline Overview](./pipeline/planning/PREFETCH-PIPELINE-OVERVIEW.md)
- [NeedSet Logic](./pipeline/planning/NEEDSET-LOGIC-IN-OUT.md)
- [Brand Resolver Logic](./pipeline/planning/BRAND-RESOLVER-LOGIC-IN-OUT.md)
- [Search Profile Logic](./pipeline/planning/SEARCH-PROFILE-LOGIC-IN-OUT.md)
- [Search Planner Logic](./pipeline/planning/SEARCH-PLANNER-LOGIC-IN-OUT.md)
- [Query Journey Logic](./pipeline/planning/QUERY-JOURNEY-LOGIC-IN-OUT.md)
- [Search Results Logic](./pipeline/planning/SEARCH-RESULTS-LOGIC-IN-OUT.md)
- [SERP Triage Logic](./pipeline/planning/SERP-TRIAGE-LOGIC-IN-OUT.md)
- [Pipeline Contract Audit](./pipeline/planning/PIPELINE-CONTRACT-AUDIT.md)

### Crawl Pipeline (replaces old stages 09–13)
- [Crawl Pipeline Overview](./pipeline/parsing/CRAWL-PIPELINE-OVERVIEW.md)
- [Crawl Settings Reference](./pipeline/parsing/CRAWL-SETTINGS.md)

### Cross-Pipeline
- [Data Flow Lineage Audit](./pipeline/DATA-FLOW-LINEAGE-AUDIT.md)
- [Product Goal](./PRODUCT-GOAL.md)

## Preserved Historical Docs

The following are preserved for reference only. They describe the OLD 13-stage pipeline architecture that was replaced on 2026-03-24. Active docs and live source files win when they disagree.

- [IDX And Source Pipeline](./pipeline/IDX-AND-SOURCE-PIPELINE.md) — old source inventory
- [Spec Factory Knobs](./pipeline/SPEC_FACTORY_KNOBS.md) — old knobs reference
- Stage-by-stage JSON contracts in `pipeline/planning/` (01–08) — still active
- Old parsing contracts (stages 09–13) — **deleted** (code no longer exists)

## Guardrails

- Active docs: `pipeline/planning/` (discovery) and `pipeline/parsing/` (crawl)
- Historical docs: everything else in this subtree
- Live source files always win over documentation
