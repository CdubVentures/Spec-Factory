import { memo } from 'react';

/**
 * Key Finder — Indexing Lab panel (Phase 2 stub).
 *
 * Phase 4 delivers the full dashboard (key explorer, filters, bulk runs).
 * For now the tab renders a placeholder so codegen's lazy import resolves.
 */
export const KeyFinderPanel = memo(function KeyFinderPanel() {
  return (
    <div className="p-6 sf-text-label">
      <h3 className="sf-text-heading-sm mb-2">Key Finder</h3>
      <p className="sf-text-muted">
        Dashboard UI lands in Phase 4. LLM tier settings are live in LLM Config → Key Finder.
        Per-category budget scoring, bundling, and discovery-history toggles are in
        Pipeline Settings → Key Finder.
      </p>
    </div>
  );
});
