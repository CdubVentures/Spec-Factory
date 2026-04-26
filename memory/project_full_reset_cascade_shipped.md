---
name: full reset cascade shipped
description: PIF/CEF "Delete All" now full-resets via onAfterDeleteAll hook + drawer pattern in panels and Command Console
type: project
---

Shipped 2026-04-25:

**Backend cascade** — new `onAfterDeleteAll` config hook in `src/core/finder/finderRoutes.js:663-675` fires only on the delete-all path (not single-run delete). Wired:
- CEF (`src/features/color-edition/api/colorEditionFinderRoutes.js:65-72`) → `deleteAllVariants(...)` which cascades to PIF (images/runs/evals/carousel) and RDF/SKU per-variant entries via existing `deleteVariant` chain.
- PIF (`src/features/product-image/api/productImageFinderRoutes.js:140-148`) → new `fullResetProductImages(...)` helper in `src/features/product-image/productImageFullReset.js` (wipes image dir + originals/, evaluations[], carousel_slots, pif_variant_progress projection).

**Header drawer pattern** — PIF/CEF panel headers now mirror RDF/SKU with `PromptDrawerChevron` containing `Prompts:` / `Hist:` / `Data:` (Delete All) sections. PIF keeps `Eval All` + `Loop` outside drawer; CEF keeps just `Run` outside.

**Command Console bulk Delete drawer** — right-anchored chevron in chips row (`tools/gui-react/src/pages/overview/CommandConsole.tsx`) opens to a `Delete:` section with 5 buttons (CEF/PIF/RDF/SKU/KF) that fan out per-finder DELETE across selected products. New helpers in `bulkDispatch.ts` (`dispatchCefDeleteAll` etc.) — pure `api.del` fan-out with stagger, no operations tracker. Three confirm gates: active-warn → big-batch confirm → `FinderDeleteConfirmModal`.

**Why:** User wanted "FULL RESET I CAN" symmetry across all finders + bulk fan-out from Overview. RDF/SKU/KF already did full wipes (everything-in-runs); PIF/CEF needed cascade hooks because PIF has on-disk artifacts and CEF has variant_registry.

**How to apply:** When adding a new variantArtifactProducer/variantFieldProducer module, wire its `onAfterDeleteAll` hook to clean up its own non-runs artifacts. Don't add cleanup to `onAfterRunDelete` — that fires on single-run delete too.
