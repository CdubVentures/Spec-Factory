# Routing / URL / Deep-Link State Audit

Date: 2026-04-28
Current severity: **MEDIUM**

## Scope

The app uses `HashRouter`, but contextual state is mostly in memory or local storage rather than URL contracts. This hurts refresh recovery and shareable deep links.

## Active Findings

### G1. Review drawer state is not refresh-safe - MEDIUM

Refreshing Review closes the active drawer and loses product/field context.

**Fix shape:** Encode drawer context in hash query params and hydrate on mount.

### G2. Overview multi-select is not refresh-safe - MEDIUM

Bulk selection is in memory and is wiped on refresh.

**Fix shape:** Persist selection per category or encode it only for workflows where recovery matters.

### G3. Contextual deep links are missing - MEDIUM

Review, IndexLab, Component Review, and Storage lack stable URLs for common focused states.

**Fix shape:** Define small URL contracts per page and hydrate stores from params.

### G4. IndexLab picker requires session state - MEDIUM

Links navigate to `/indexing` after setting Zustand state. Pasting the route alone cannot restore brand/product/run context.

**Fix shape:** Encode picker state in the URL and hydrate before reading the store.

### G5. Discovery history drawer state is not persistent - LOW

The drawer closes on refresh.

**Fix shape:** Defer unless users need shareable discovery-history links.

### G6. No deletion-to-route auto-close contract - LOW

If an entity is deleted while a route/drawer targets it, the UI may keep stale context.

**Fix shape:** Pair with selection-focus deletion pruning.

## Recommended Fix Order

1. **G2** - Persist Overview selection if bulk workflows need recovery.
2. **G1/G4** - URL params for Review drawer and IndexLab picker.
3. **G3** - Extend deep-link contracts to other surfaces.
4. **G6** - Auto-close stale routes after deletion.
5. **G5** - Defer.
