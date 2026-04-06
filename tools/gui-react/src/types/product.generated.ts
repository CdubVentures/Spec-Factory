// AUTO-GENERATED from backend shape descriptors — do not edit manually.
// Run: node tools/gui-react/scripts/generateProductTypes.js
//
// Shape descriptors live in:
//   src/features/catalog/contracts/catalogShapes.js
//   src/features/catalog/contracts/productShapes.js

export interface BrandRenameHistoryEntryGen {
  previous_slug: string;
  previous_name: string;
  renamed_at: string;
}

export interface CatalogProductGen {
  productId: string;
  id: number;
  identifier: string;
  brand: string;
  brand_identifier?: string;
  model: string;
  base_model: string;
  variant: string;
  status: string;
  added_at: string;
  added_by: string;
  updated_at?: string;
}

export interface CatalogRowGen {
  productId: string;
  id: number;
  identifier: string;
  brand: string;
  brand_identifier?: string;
  model: string;
  base_model: string;
  variant: string;
  status: string;
  hasFinal: boolean;
  validated: boolean;
  confidence: number;
  coverage: number;
  fieldsFilled: number;
  fieldsTotal: number;
  lastRun: string;
  inActive: boolean;
}

export interface BrandGen {
  slug: string;
  canonical_name: string;
  identifier: string;
  aliases: string[];
  categories: string[];
  website: string;
  added_at: string;
  added_by: string;
  updated_at?: string;
  rename_history?: BrandRenameHistoryEntryGen[];
}

export interface ProductSummaryGen {
  productId: string;
  category: string;
  confidence: number;
  coverage_overall: number;
  fields_total: number;
  fields_filled: number;
  fields_below_pass_target: string[];
  critical_fields_below_pass_target: string[];
  missing_required_fields: string[];
  generated_at: string;
  runId?: string;
  field_reasoning?: Record<string, unknown>;
  constraint_analysis?: Record<string, unknown>;
}

export interface QueueProductGen {
  productId: string;
  status: string;
  priority: number;
  attempts: number;
  updated_at: string;
}
