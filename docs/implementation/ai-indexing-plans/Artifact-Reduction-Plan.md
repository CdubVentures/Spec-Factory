**Artifact Reduction &**

**Document AI Integration Plan**

DocVQA Parser + Local LLM Triage + Storage Optimization

IndexLab --- March 2026

**1. The Storage Problem**

A single product run in the collect-then-refine architecture fetches
20-30 pages. Each page produces: raw HTML (500KB-2MB), network captures
(200KB-1MB), screenshots (200KB-800KB each), per-source extraction JSON
(20-50KB), and LLM trace files (10-30KB). Without optimization, a single
product generates 30-80MB of artifacts. At 20 products/day, that is
600MB-1.6GB/day or 18-48GB/month.

The goal is to reduce per-product storage to under 5MB while preserving
every piece of evidence needed for the comparison matrix, provenance
chain, and future review. The reduction happens in 4 layers, each
applied at a specific stage of the pipeline.

**2. Artifact Lifecycle: What Gets Created, When It Gets Reduced**

**Layer 1: Raw Content Capture (Stage 1 output)**

Every fetched page produces a raw artifact. This is the largest storage
consumer and the first reduction target.

  ---------------- ------------ ------------- ------------- ----------------
  **Artifact**     **Raw Size** **After       **Reduction   **Method**
                                Reduction**   %**           

  HTML page        500KB - 2MB  15KB - 60KB   **92-97%**    Strip to
                                                            spec-relevant
                                                            text

  PDF document     200KB - 30MB 20KB - 200KB  **90-99%**    Extract text +
                                                            tables only

  Network captures 200KB - 1MB  0 (deleted)   **100%**      Discard after
                                                            extraction

  Page screenshot  200KB -      30KB - 80KB   **85-90%**    WebP quality 50,
                   800KB                                    max 768px

  Spec-region crop 100KB -      Kept at full  0% (evidence) Keep for
                   400KB        res                         DocVQA + review

  LLM traces       10KB - 30KB  5KB - 15KB    **50%**       Strip prompt
                                                            text, keep
                                                            metadata
  ---------------- ------------ ------------- ------------- ----------------

**Layer 2: Per-Source Extraction (Stage 2 output)**

Each fetched page produces a per-source JSON with all extracted fields,
values, and evidence. This is the primary working artifact for Stage 3-5
and must be fully preserved. However, the raw content it was extracted
FROM can now be reduced.

  ------------------ ------------ ------------- ------------- --------------
  **Artifact**       **Raw Size** **After       **Reduction   **Method**
                                  Reduction**   %**           

  Per-source         20-50KB      20-50KB       0%            Fully
  extraction JSON                 (kept)                      preserved

  Evidence quotes    5-15KB       5-15KB (kept) 0%            Fully
  (in JSON)                                                   preserved

  Parser warning log 1-5KB        1-5KB (kept)  0%            Fully
                                                              preserved
  ------------------ ------------ ------------- ------------- --------------

**Layer 3: Comparison Artifacts (Review Phase output — not part of the Collection Pipeline)**

*These artifacts are produced by the Review Phase, which executes independently after collection. The Collection Pipeline (13 stages) produces Layers 1–2 only.*

The comparison matrix, consensus values, and conflict annotations. These
are compact and fully preserved.

**Comparison matrix JSON:** 10-30KB per product (kept)

**comparison.csv:** 5-15KB per product (kept)

**Provenance JSON:** 15-40KB per product (kept)

**Layer 4: Final Published Spec (Review Phase output — not part of the Collection Pipeline)**

**spec.json:** 5-10KB per product (kept)

**provenance.json:** 15-40KB per product (kept)

**comparison.csv:** 5-15KB per product (kept)

**3. The Reduction Pipeline: Step by Step**

**Step 1: HTML Stripping (immediate, during Stage 1)**

After the page is fetched and before it is stored to disk, strip the raw
HTML down to spec-relevant content. This is the single largest storage
savings.

**What Gets Stripped**

-   Navigation bars, headers, footers, sidebars

-   Advertising scripts, tracking pixels, analytics code

-   CSS stylesheets (inline and external references)

-   JavaScript (all script tags and inline handlers)

-   Social media widgets, share buttons, comment sections

-   Cookie consent banners, modal overlays

-   Image tags (replaced with alt-text references)

-   SVG decorations, icons, logo elements

-   Repeated boilerplate (terms of service links, footer links)

**What Gets Kept**

-   Spec tables (any table with product specification data)

-   Key-value pairs in description lists or definition lists

-   Article body text (main content area)

-   JSON-LD and structured metadata in script tags

-   Product title and heading hierarchy

-   Price and availability information

-   Image alt-text (as text references, not image bytes)

**Implementation**

Use a two-pass approach: first, extract structured data (JSON-LD,
tables, metadata) into separate fields. Second, run the remaining HTML
through a text extractor (Trafilatura or similar) that outputs clean
text with section headings preserved. The clean text replaces the raw
HTML on disk.

**Input:** 2MB raw HTML (razer.com product page with 1.9M of
JS/CSS/tracking)

**Output:** 45KB clean text (spec table + article text + JSON-LD +
metadata)

**Reduction:** 97.7%

**Step 2: Network Capture Disposal (immediate, after Stage 2)**

During Stage 1, the Playwright fetcher captures network responses (XHR,
fetch API calls, GraphQL responses) for potential use by the
graphql_replay and network_json parsers. After Stage 2 extraction is
complete, these captures are no longer needed.

**Rule:** After per-source extraction JSON is produced and validated,
delete all network capture files for that source.

**Exception:** If a network response contained the primary spec data
(graphql_replay produced high-yield fields), keep a compact summary
(URL, response size, fields extracted) but delete the raw response body.

**Savings:** 200KB-1MB per page, 100% reduction on this artifact class.

**Step 3: Screenshot Tiering (during Stage 1, refined in Stage 2)**

Screenshots serve two purposes: operator review (Shots tab) and visual
evidence (DocVQA input). These have different storage requirements.

**Tier A: Review Thumbnails (every page)**

**Format:** WebP

**Quality:** 50

**Max dimensions:** 768px wide (aspect ratio preserved)

**Expected size:** 30-80KB per screenshot

**Retention:** 30 days, then deleted

**Purpose:** Operator can see what the page looked like. Not for OCR or
extraction.

**Tier B: Spec-Region Crops (selective, local LLM decides)**

**Format:** WebP or PNG

**Quality:** 85 (higher for OCR accuracy)

**Max dimensions:** 1600px wide

**Expected size:** 100-300KB per crop

**Retention:** 90 days (or permanent if DocVQA extracted fields from it)

**Purpose:** DocVQA input for spec tables, packaging text, chart data.
This is evidence.

**Selection:** Local LLM (Qwen2.5-VL) classifies each full screenshot:
contains_specs / no_specs / ambiguous. Only contains_specs screenshots
get a high-resolution crop of the spec region.

**Tier C: Full-Resolution Archive (S3 cold storage)**

**Format:** Original JPEG/PNG from Playwright

**Retention:** 90 days in S3 cold storage

**Purpose:** Available for xhigh model re-review if needed. Not accessed
during normal operation.

**Rule:** Uploaded to S3 asynchronously after the run completes. Deleted
from local disk after upload confirmation.

**Step 4: LLM Trace Compaction (after Stage 2)**

Each LLM call produces a trace file with the full prompt, full response,
and metadata. The prompt often contains the same evidence text that
exists in the per-source extraction JSON (duplicated).

**Keep:** Model name, role, token count, cost, latency, field count,
success/failure, error message if any.

**Strip:** Full prompt text (available from per-source JSON if needed).
Full response text (fields are in extraction JSON).

**Keep selectively:** Response text for failed calls (debugging). Prompt
text for the first call of each prompt version (template reference).

**Savings:** 50% reduction on LLM trace files (10-30KB → 5-15KB).

**Step 5: Local LLM Source Summary (after Stage 2, before Stage 3)**

The local LLM (Qwen3-8B) reads each per-source extraction JSON and
produces a 500-word natural-language summary of what the source
contains. This summary replaces the need to re-read the full cleaned
text for most review purposes.

**Input:** Per-source extraction JSON (20-50KB) + cleaned text (15-60KB)

**Output:** 500-word summary (2-3KB) stored alongside the extraction
JSON

**Rule:** The cleaned text can then be moved to S3 cold storage. The
extraction JSON + summary stay on local disk for Stage 3-5 processing.

**Fallback:** If local LLM is unavailable, skip summarization. Keep
cleaned text on local disk.

**4. Storage Layout After Reduction**

**Local Disk (Hot --- Active Products)**

This is what stays on the machine during and after a run:

  -------------------------- ----------- ----------- ---------------------
  **Artifact**               **Per       **Per       **Notes**
                             Source**    Product (10 
                                         src)**      

  Per-source extraction JSON 20-50KB     200-500KB   Primary working
                                                     artifact. Never
                                                     reduced.

  Local LLM summary          2-3KB       20-30KB     Replaces full text
                                                     for review. Optional.

  Review thumbnails          30-80KB     300-800KB   WebP q50, 768px max.
                                                     30-day retention.

  Spec-region crops          100-300KB   200-600KB   Only for pages with
                                                     spec content. DocVQA
                                                     input.

  Comparison matrix          ---         10-30KB     One per product.
                                                     Compact.

  Provenance JSON            ---         15-40KB     One per product.

  spec.json                  ---         5-10KB      Final published
                                                     output.

  comparison.csv             ---         5-15KB      Downloadable field ×
                                                     source matrix.

  LLM trace metadata         5-15KB      50-150KB    Compacted --- no
                                                     prompt/response text.

  URL memory NDJSON          ---         shared      Category-level, not
                                                     per-product.

  **TOTAL LOCAL**            ---         **1-3MB**   **Down from 30-80MB
                                                     raw.**
  -------------------------- ----------- ----------- ---------------------

**S3 Cold Storage (Archive --- On Demand)**

  -------------------------- ------------- --------------- -----------------
  **Artifact**               **Per         **Retention**   **Access
                             Source**                      Pattern**

  Cleaned text (HTML         15-60KB       90 days         Retrieved for
  stripped)                                                xhigh model
                                                           re-review

  Full-resolution            200-800KB     90 days         Retrieved for
  screenshots                                              deep visual
                                                           analysis

  PDF originals              200KB-30MB    90 days         Retrieved for
                                                           DocVQA
                                                           re-processing

  Full LLM traces (first run 10-30KB       30 days         Debugging only
  only)                                                    
  -------------------------- ------------- --------------- -----------------

**Deleted (Never Stored After Extraction)**

-   Raw HTML (replaced by cleaned text)

-   Network capture responses (XHR, fetch, GraphQL raw bodies)

-   Duplicate screenshots (same page captured multiple times)

-   Tracking/analytics scripts

-   CSS stylesheets

**5. DocVQA / QdocParser Integration**

**Why DocVQA**

QdocParser achieves 96.4% accuracy on the DocVQA benchmark --- the
standard test for extracting information from document images. This is
directly applicable to IndexLab\'s hardest extraction problems: scanned
PDF spec sheets, product packaging photos with spec stickers, complex
multi-column PDF layouts, and spec table screenshots from pages that
resist text extraction.

**What DocVQA Handles That Current Parsers Cannot**

  ----------------------- ----------------------- -----------------------
  **Source Type**         **Current Parser**      **DocVQA Advantage**

  Scanned PDF spec sheet  Tesseract OCR (60-70%   96.4% accuracy,
                          accuracy)               understands layout

  Multi-column PDF        pdf_text extracts as    Understands column
                          linear text (loses      layout, extracts
                          structure)              per-column

  Spec table in           No parser (visual       Reads table from image,
  screenshot              pipeline incomplete)    extracts key-value
                                                  pairs

  Product packaging photo No parser               Reads spec stickers,
                                                  regulatory text, model
                                                  numbers

  Chart/graph with data   Chart extraction        Reads data labels, axis
  labels                  partial                 values, legend text

  Handwritten teardown    No parser               OCR + layout
  notes                                           understanding for
                                                  structured notes
  ----------------------- ----------------------- -----------------------

**Integration Architecture**

DocVQA runs as a local service (Docker container or direct Python
process) alongside the IndexLab server. It processes documents and
images that other parsers cannot handle well.

**Routing Logic (in Stage 2 extraction)**

1.  Text PDF → pdf_text + pdf_kv + pdf_table (deterministic, fast, free)

2.  Scanned PDF (\< 30 chars/page) → DocVQA document mode (96.4%
    accuracy)

3.  Complex layout PDF (multi-column, form-like) → DocVQA document mode

4.  Spec-region screenshot crop → DocVQA image mode

5.  Product photo with text → DocVQA image mode

6.  Chart/graph screenshot → DocVQA image mode → chart_data extraction

7.  All other pages → existing parsers (static_dom, json_ld,
    html_spec_table, etc.)

**DocVQA Service Configuration**

**Endpoint:** http://127.0.0.1:8012/extract

**Model:** QdocParser (or equivalent DocVQA-optimized model)

**GPU:** Required for production speed. CPU mode available but 10-20x
slower.

**Timeout:** 5 seconds per page (configurable). Timeout = skip DocVQA,
fall back to Tesseract.

**Batch size:** 1 document at a time (GPU memory constraint). Queue
pages.

**Max pages per PDF:** 10 (spec sheets rarely exceed this). Skip
remaining pages.

**DocVQA Output Schema**

DocVQA produces the same field/value/evidence shape as every other
parser, so Stage 3-5 processing is identical:

**field_name:** The extracted field (e.g., \'weight\', \'sensor\',
\'dpi\')

**value_raw:** The raw extracted text (e.g., \'54g\', \'Focus Pro 36K\')

**value_normalized:** Normalized value (e.g., \'54\', \'Focus Pro 36K\')

**unit:** Extracted or inferred unit (e.g., \'g\', \'Hz\')

**method:** \'docvqa_document\' or \'docvqa_image\'

**confidence:** Model confidence score (0-1)

**evidence_quote:** The text region the model read from

**bbox:** Bounding box coordinates of the text region in the
document/image

**DocVQA and Artifact Reduction Interaction**

DocVQA is the reason spec-region crops are kept at high resolution (Tier
B screenshots). The workflow is:

8.  Stage 1: Fetch page, capture full screenshot.

9.  Stage 1: Local LLM (Qwen2.5-VL) classifies screenshot:
    contains_specs / no_specs / ambiguous.

10. Stage 1: For contains_specs pages, capture high-res crop of spec
    region (1600px wide, quality 85).

11. Stage 1: Store review thumbnail (768px, quality 50) for operator
    view.

12. Stage 2: DocVQA processes the high-res spec-region crop.

13. Stage 2: Fields extracted from the crop are added to the per-source
    extraction JSON.

14. Stage 2: The crop is retained (it is evidence for the extracted
    fields).

15. Stage 2: The full-resolution screenshot is uploaded to S3 cold
    storage, deleted locally.

**6. Local LLM as First Artifact Triage Layer**

**Architecture**

The local LLM is the first layer of intelligence applied to raw
artifacts. It decides what to keep, what to compress, what to archive,
and what to flag for review. Every decision is advisory and logged. The
pipeline works identically without it.

**Triage Decisions by Stage**

**Stage 1 Triage (pre-fetch and post-fetch)**

  ------------------ ------------------ ---------------- ----------------
  **Decision**       **Model**          **Input**        **Output**

  URL relevance      Qwen3-8B           URL + title +    fetch / skip /
  pre-fetch                             snippet          deprioritize

  Screenshot         Qwen2.5-VL         Full page        contains_specs /
  classification                        screenshot       no_specs /
                                                         ambiguous

  Spec region        Qwen2.5-VL         Full page        Bounding box of
  detection                             screenshot       spec
                                                         table/region

  Content type       Qwen3-8B           Page title +     spec_page /
  classification                        first 500 chars  review / listing
                                                         / forum / other
  ------------------ ------------------ ---------------- ----------------

**Stage 2 Triage (post-extraction)**

  ------------------ ------------------ ---------------- ----------------
  **Decision**       **Model**          **Input**        **Output**

  Value plausibility Qwen3-8B           Field + value +  plausible /
  check                                 unit             implausible +
                                                         reason

  Source summary     Qwen3-8B           Extraction       500-word summary
  generation                            JSON + cleaned   of what source
                                        text             contains

  Storage tier       Qwen3-8B           Source           hot (local) /
  assignment                            metadata + field warm (local
                                        yield            compressed) /
                                                         cold (S3)

  Network capture    Qwen3-8B           Network response keep_summary /
  relevance                             URLs + sizes     discard
  ------------------ ------------------ ---------------- ----------------

**Stage 3 Triage (identity classification)**

  ------------------ ------------------ ---------------- ------------------
  **Decision**       **Model**          **Input**        **Output**

  Identity           Qwen3-8B           Page title +     confirmed /
  classification                        extracted        variant / rejected
                                        brand/model      / uncertain

  Variant field      Qwen3-8B           Product family + shared /
  eligibility                           field name       variant-specific
  ------------------ ------------------ ---------------- ------------------

**Storage Tier Assignment Rules**

The local LLM assigns each source artifact to a storage tier based on
recency, yield, and access pattern:

  ------------- ------------------ --------------------- -------------------
  **Tier**      **Criteria**       **What Stays**        **Retention**

  Hot (local)   Last 30 days +     Extraction JSON,      30 days, then
                high yield         summary, thumbnails,  demote to warm
                                   spec crops            

  Warm (local   31-90 days or low  Extraction JSON       90 days, then
  compressed)   yield              (gzipped), thumbnails demote to cold
                                   only                  

  Cold (S3)     \> 90 days or      Extraction JSON,      1 year
                archive-only       cleaned text, full    
                                   screenshots           

  Deleted       Zero yield +       Nothing (URL memory   URL record:
                rejected identity  record remains)       permanent
  ------------- ------------------ --------------------- -------------------

**7. xHigh Model Review Workflow**

For high-value products or persistent conflicts, an xhigh model
(GPT-5.2-xhigh or equivalent) can review the full artifact set. This is
expensive and selective --- not run on every product.

**When xHigh Review Triggers**

-   Comparison matrix has 3+ unresolved conflicts after Stage 4

-   Operator manually requests deep review

-   Product is flagged as high-priority (launch product, popular
    product)

-   Identity classification has 3+ uncertain sources

**What xHigh Model Receives**

-   All per-source extraction JSONs (hot tier, local)

-   Comparison matrix with conflict annotations

-   Full cleaned text from S3 for conflict sources

-   Full-resolution screenshots from S3 for visual evidence

-   Spec-region crops at full resolution

-   Source summaries from local LLM

-   Identity classification with reasons

**What xHigh Model Produces**

-   Conflict resolution recommendations (with reasoning)

-   Identity reclassification suggestions

-   Parser error identifications

-   Confidence adjustments per field

-   Suggested consensus values with evidence citations

**Every xhigh recommendation is logged and requires operator approval
before changing published values. The model does not auto-publish.**

**8. Per-Product Size Budget**

**Target: \< 5MB per product on local disk after reduction**

  ------------------------------ --------------- -------------------------
  **Component**                  **Budget**      **Notes**

  Per-source extraction JSONs    500KB           50KB avg × 10 sources
  (10 sources)                                   

  Local LLM summaries (10        30KB            3KB × 10
  sources)                                       

  Review thumbnails (10          600KB           60KB avg × 10
  screenshots)                                   

  Spec-region crops (3-5 pages)  1MB             250KB avg × 4

  Comparison matrix + CSV        50KB            30KB + 15KB

  Provenance JSON                40KB            Per-field evidence chain

  spec.json                      10KB            Final published output

  LLM trace metadata             100KB           10KB × 10 calls

  URL memory contribution        shared          Category-level

  **TOTAL**                      **\~2.3MB**     **Well under 5MB budget**
  ------------------------------ --------------- -------------------------

**Before vs After**

  ----------------------- ----------------------- -----------------------
  **Metric**              **Before (Raw)**        **After (Reduced)**

  Per product (local)     30-80MB                 **1.5-3MB**

  Per product (total incl 30-80MB                 5-15MB
  S3)                                             

  Daily (20 products,     600MB-1.6GB             **30-60MB**
  local)                                          

  Monthly (local)         18-48GB                 **0.9-1.8GB**

  Monthly (S3 cold)       N/A                     3-9GB

  Reduction               ---                     **95-97%**
  ----------------------- ----------------------- -----------------------

**At 20 products/day with artifact reduction, local storage grows at
approximately 2GB/month. An 80GB disk holds 3+ years of product data. S3
cold storage at \$0.004/GB costs approximately \$0.04/month for the
archive.**
