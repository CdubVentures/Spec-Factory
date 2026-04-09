export const CONSTRAINT_OPS = ['<=', '>=', '<', '>', '==', '!=', 'requires'] as const;

export type FieldTypeGroup = 'numeric' | 'date' | 'boolean' | 'string';

// WHY: Type-driven derivation. contract.type is the sole source — no parse.template fallback.
export function deriveTypeGroup(
  rule: Record<string, unknown>,
): FieldTypeGroup {
  const contract =
    rule.contract && typeof rule.contract === 'object'
      ? (rule.contract as Record<string, unknown>)
      : {};
  const contractType = String(contract.type || '').trim().toLowerCase();
  if (contractType === 'integer' || contractType === 'number') return 'numeric';
  if (contractType === 'date') return 'date';
  if (contractType === 'boolean') return 'boolean';
  return 'string';
}

export const TYPE_GROUP_OPS: Record<FieldTypeGroup, Set<string>> = {
  numeric: new Set(['<=', '>=', '<', '>', '==', '!=', 'requires']),
  date: new Set(['<=', '>=', '<', '>', '==', '!=', 'requires']),
  boolean: new Set(['==', '!=', 'requires']),
  string: new Set(['==', '!=', 'requires']),
};

export function areTypesCompatible(
  left: FieldTypeGroup,
  right: FieldTypeGroup,
): boolean {
  if (left === right) return true;
  if (left === 'numeric' && right === 'numeric') return true;
  return false;
}

const RANGE_LOWER_OPS = new Set(['>=', '>']);
const RANGE_UPPER_OPS = new Set(['<=', '<']);

export interface RangePair {
  lowerIdx: number;
  upperIdx: number;
  lower: string;
  upper: string;
  display: string;
}

export function groupRangeConstraints(
  constraints: string[],
  currentKey: string,
): { ranges: RangePair[]; singles: Array<{ idx: number; expr: string }> } {
  const parsed = constraints.map((expr, idx) => {
    const match = expr.match(/^(\S+)\s+(<=?|>=?|==|!=|requires)\s+(.+)$/);
    if (!match || match[1] !== currentKey) {
      return { idx, expr, field: '', op: '', value: '' };
    }
    return {
      idx,
      expr,
      field: match[1],
      op: match[2],
      value: match[3].trim(),
    };
  });

  const lowers = parsed.filter(
    (entry) => entry.field === currentKey && RANGE_LOWER_OPS.has(entry.op),
  );
  const uppers = parsed.filter(
    (entry) => entry.field === currentKey && RANGE_UPPER_OPS.has(entry.op),
  );
  const pairedLower = new Set<number>();
  const pairedUpper = new Set<number>();
  const ranges: RangePair[] = [];

  for (const lower of lowers) {
    for (const upper of uppers) {
      if (pairedUpper.has(upper.idx)) continue;
      const lowerValue = Number(lower.value);
      const upperValue = Number(upper.value);
      if (
        !Number.isNaN(lowerValue) &&
        !Number.isNaN(upperValue) &&
        lowerValue < upperValue
      ) {
        ranges.push({
          lowerIdx: lower.idx,
          upperIdx: upper.idx,
          lower: lower.expr,
          upper: upper.expr,
          display: `${lower.value} ${
            lower.op === '>=' ? '\u2264' : '<'
          } ${currentKey} ${upper.op === '<=' ? '\u2264' : '<'} ${upper.value}`,
        });
        pairedLower.add(lower.idx);
        pairedUpper.add(upper.idx);
        break;
      }
    }
  }

  const pairedIndexes = new Set([...pairedLower, ...pairedUpper]);
  const singles = parsed
    .filter((entry) => !pairedIndexes.has(entry.idx))
    .map((entry) => ({ idx: entry.idx, expr: entry.expr }));
  return { ranges, singles };
}
