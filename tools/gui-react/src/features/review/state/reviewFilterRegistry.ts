// WHY: O(1) filter scaling — adding a new filter axis requires one entry here,
// one predicate function, and one store field. Persistence + UI iterate this registry.

export type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low';
export type CoverageFilter = 'all' | 'complete' | 'partial' | 'sparse';
export type RunStatusFilter = 'all' | 'ran' | 'not-ran';

export interface FilterGroupDef {
  readonly key: string;
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly defaultValue: string;
  readonly validValues: ReadonlySet<string>;
}

export const FILTER_REGISTRY: readonly FilterGroupDef[] = [
  {
    key: 'confidenceFilter',
    label: 'Confidence',
    options: [
      { value: 'all', label: 'All' },
      { value: 'high', label: 'High' },
      { value: 'medium', label: 'Med' },
      { value: 'low', label: 'Low' },
    ],
    defaultValue: 'all',
    validValues: new Set(['all', 'high', 'medium', 'low']),
  },
  {
    key: 'coverageFilter',
    label: 'Coverage',
    options: [
      { value: 'all', label: 'All' },
      { value: 'complete', label: 'Complete' },
      { value: 'partial', label: 'Partial' },
      { value: 'sparse', label: 'Sparse' },
    ],
    defaultValue: 'all',
    validValues: new Set(['all', 'complete', 'partial', 'sparse']),
  },
  {
    key: 'runStatusFilter',
    label: 'Run Status',
    options: [
      { value: 'all', label: 'All' },
      { value: 'ran', label: 'Ran' },
      { value: 'not-ran', label: 'Not Ran' },
    ],
    defaultValue: 'all',
    validValues: new Set(['all', 'ran', 'not-ran']),
  },
];
