function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function knownFieldCount(spec = {}, fieldOrder = []) {
  let count = 0;
  for (const field of fieldOrder || []) {
    const token = String(spec?.[field] || '').trim().toLowerCase();
    if (token && token !== 'unk' && token !== 'n/a' && token !== 'null') {
      count += 1;
    }
  }
  return count;
}

export class UberAggressiveOrchestrator {
  constructor({
    config,
    logger,
    frontier
  } = {}) {
    this.config = config || {};
    this.logger = logger || null;
    this.frontier = frontier || null;
  }

  buildCoverageDelta({
    previousSpec = {},
    currentSpec = {},
    fieldOrder = []
  } = {}) {
    const previousKnown = knownFieldCount(previousSpec, fieldOrder);
    const currentKnown = knownFieldCount(currentSpec, fieldOrder);
    const gained = [];
    const lost = [];
    for (const field of fieldOrder || []) {
      const prev = String(previousSpec?.[field] || '').trim().toLowerCase();
      const next = String(currentSpec?.[field] || '').trim().toLowerCase();
      const prevKnown = prev && prev !== 'unk' && prev !== 'n/a' && prev !== 'null';
      const nextKnown = next && next !== 'unk' && next !== 'n/a' && next !== 'null';
      if (!prevKnown && nextKnown) {
        gained.push(field);
      } else if (prevKnown && !nextKnown) {
        lost.push(field);
      }
    }
    return {
      previous_known_count: previousKnown,
      current_known_count: currentKnown,
      delta_known: currentKnown - previousKnown,
      gained_fields: toArray(gained),
      lost_fields: toArray(lost)
    };
  }
}
