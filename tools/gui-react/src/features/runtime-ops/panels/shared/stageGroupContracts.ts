// WHY: Generic foundation for registry-driven stage panel groups.
// Each pipeline stage group (prefetch, fetch, extraction) follows
// the same pattern: keys file → selectProps file → registry file → panel components.
// This file provides the shared contracts so groups don't duplicate structure.

import { createElement, type ReactElement, type ComponentType } from 'react';

// ── Group identity ──────────────────────────────────────────────────

export const STAGE_GROUP_KEYS = ['prefetch', 'fetch', 'extraction'] as const;
export type StageGroupId = (typeof STAGE_GROUP_KEYS)[number];

// ── Generic stage entry ─────────────────────────────────────────────

export interface StageEntry<K extends string, C> {
  readonly key: K;
  readonly label: string;
  readonly tip: string;
  readonly markerClass: string;
  readonly idleClass: string;
  readonly outlineClass: string;
  readonly render: (ctx: C) => ReactElement | null;
  readonly selectProps: (ctx: C) => Record<string, unknown>;
}

// ── Generic stage group definition ──────────────────────────────────

export interface StageGroupDef<K extends string, C> {
  readonly id: StageGroupId;
  readonly label: string;
  readonly tip: string;
  readonly keys: readonly K[];
  readonly registry: readonly StageEntry<K, C>[];
}

// WHY: Heterogeneous collection type — groups have different K and C type params.
// The `any` context is the controlled type-erasure boundary for the collection,
// same pattern as the `any` on ComponentType in buildStageEntry.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyStageGroupDef = StageGroupDef<string, any>;

// ── Factory ─────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any -- Component generics erased at registry boundary via render() */
export function buildStageEntry<K extends string, C>(
  key: K,
  label: string,
  tip: string,
  markerClass: string,
  idleClass: string,
  outlineClass: string,
  Component: ComponentType<any>,
  selectProps: (ctx: C) => Record<string, unknown>,
): StageEntry<K, C> {
  return {
    key, label, tip, markerClass, idleClass, outlineClass, selectProps,
    render: (ctx) => createElement(Component, selectProps(ctx)),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
