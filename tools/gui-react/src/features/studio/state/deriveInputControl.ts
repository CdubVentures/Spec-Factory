export type InputControl =
  | 'text' | 'number' | 'select' | 'multi_select'
  | 'component_picker' | 'token_list' | 'list_editor'
  | 'url' | 'date' | 'checkbox' | 'text_list';

export interface DeriveInputControlOptions {
  type?: string | null;
  shape?: string | null;
  enumSource?: string | null;
  enumPolicy?: string | null;
}

const TYPE_TO_INPUT: Partial<Record<string, InputControl>> = {
  boolean: 'text',
  url: 'url',
  date: 'date',
  number: 'number',
  integer: 'number',
};

export function deriveInputControl(opts: DeriveInputControlOptions): InputControl {
  const type = String(opts.type || 'string');
  const shape = String(opts.shape || 'scalar');
  const enumSource = String(opts.enumSource || '');
  const enumPolicy = String(opts.enumPolicy || 'open');

  // 1. Component DB source (highest priority). Phase 2: enum.source is the
  // single authored linkage to a component_db; the legacy component.source
  // path was retired alongside the rest of the rule.component.* block.
  if (enumSource.startsWith('component_db.')) {
    return 'component_picker';
  }

  // 2. List + non-string → list_editor
  if (shape === 'list' && type !== 'string') return 'list_editor';

  // 3. List + string → token_list
  if (shape === 'list') return 'token_list';

  // 4. Type coupling
  const typeDerived = TYPE_TO_INPUT[type];
  if (typeDerived) return typeDerived;

  // 5. Scalar + data_lists + restrictive policy → select
  if (
    enumSource.startsWith('data_lists.') &&
    (enumPolicy === 'closed' || enumPolicy === 'open_prefer_known')
  ) {
    return 'select';
  }

  // 6. Fallback
  return 'text';
}
