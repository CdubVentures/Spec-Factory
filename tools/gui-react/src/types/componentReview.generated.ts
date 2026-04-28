// AUTO-GENERATED from backend shape descriptors — do not edit manually.
// Run: node tools/gui-react/scripts/generateReviewTypes.js
//
// Shape descriptors live in:
//   src/features/review/contracts/componentReviewShapes.js

import type { ReviewCandidateGen } from './review.generated.ts';

export interface ComponentReviewItemGen {
  component_identity_id?: number | null;
  name: string;
  maker: string;
  discovered?: boolean;
  discovery_source?: string;
  aliases: string[];
  aliases_overridden: boolean;
  links: string[];
  name_tracked: Record<string, unknown>;
  maker_tracked: Record<string, unknown>;
  links_tracked: unknown[];
  links_state: Record<string, unknown>;
  properties: Record<string, unknown>;
  linked_products?: unknown[];
  review_status: 'pending' | 'reviewed' | 'approved';
  metrics: Record<string, unknown>;
}

export interface ComponentReviewPayloadGen {
  category: string;
  componentType: string;
  property_columns: string[];
  items: ComponentReviewItemGen[];
  metrics: Record<string, unknown>;
}

export interface ComponentReviewLayoutGen {
  category: string;
  types: unknown[];
}

export interface EnumValueReviewItemGen {
  list_value_id?: number | null;
  enum_list_id?: number | null;
  value: string;
  source: 'reference' | 'pipeline' | 'manual';
  source_timestamp?: string | null;
  confidence: number;
  color: 'green' | 'yellow' | 'red' | 'gray' | 'purple';
  needs_review: boolean;
  overridden?: boolean;
  candidates: ReviewCandidateGen[];
  linked_products?: unknown[];
  normalized_value?: string | null;
  enum_policy?: string | null;
  accepted_candidate_id?: string | null;
}

export interface EnumFieldReviewGen {
  field: string;
  enum_list_id?: number | null;
  locked: boolean;
  values: EnumValueReviewItemGen[];
  metrics: Record<string, unknown>;
}

export interface EnumReviewPayloadGen {
  category: string;
  fields: EnumFieldReviewGen[];
}

export interface ComponentReviewFlaggedItemGen {
  review_id: string;
  component_type: string;
  field_key: string;
  raw_query: string;
  matched_component: string | null;
  match_type: string;
  name_score: number;
  property_score: number;
  combined_score: number;
  alternatives: unknown[];
  product_id: string | null;
  run_id?: string | null;
  status: string;
  ai_decision?: Record<string, unknown>;
  ai_suggested_name?: string;
  ai_suggested_maker?: string;
  ai_reviewed_at?: string;
  created_at: string;
  product_attributes?: Record<string, unknown>;
  reasoning_note?: string;
}

export interface ComponentReviewDocumentGen {
  version: number;
  category: string;
  items: ComponentReviewFlaggedItemGen[];
  updated_at: string;
}

export interface ComponentReviewBatchResultGen {
  processed: number;
  accepted_alias: number;
  pending_human: number;
  rejected: number;
}
