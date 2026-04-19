// AUTO-GENERATED from src/features/release-date/releaseDateSchema.js
// Run: node tools/gui-react/scripts/generateRdfTypes.js
// Do not edit manually.

export interface EvidenceRefGen {
  url: string;
  tier: string;
  confidence: number;
}

export interface ReleaseDateFinderLlmResponseGen {
  release_date: string;
  confidence: number;
  unknown_reason: string;
  evidence_refs: EvidenceRefGen[];
  discovery_log: {
    urls_checked: string[];
    queries_run: string[];
    notes: string[];
  };
}
