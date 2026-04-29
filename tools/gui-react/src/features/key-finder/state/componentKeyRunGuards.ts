import type { ComponentRunKind } from '../types.ts';

export interface ComponentKeyRunState {
  readonly component_run_kind?: ComponentRunKind | string;
  readonly component_parent_key?: string;
  readonly belongs_to_component?: string;
  readonly component_dependency_satisfied?: boolean;
  readonly run_blocked_reason?: string;
}

export function isComponentIdentityChildKey(row: ComponentKeyRunState): boolean {
  return row.component_run_kind === 'component_brand'
    || row.component_run_kind === 'component_link';
}

export function isComponentDependentKey(row: ComponentKeyRunState): boolean {
  return isComponentIdentityChildKey(row)
    || row.component_run_kind === 'component_attribute'
    || Boolean(row.component_parent_key || row.belongs_to_component);
}

export function isKeyRunBlocked(row: ComponentKeyRunState): boolean {
  if (row.run_blocked_reason) return true;
  return isComponentDependentKey(row) && row.component_dependency_satisfied === false;
}

export function componentRunBlockTitle(parentKey: string | undefined): string {
  return `Run ${parentKey || 'the parent component'} first. Component-dependent keys are locked until the parent component has a published value.`;
}
