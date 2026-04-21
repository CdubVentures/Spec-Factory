// WHY: Derives publish-gate blocking from required_level instead of storing
// redundant booleans (publish_gate, block_publish_when_unk).
// See: docs/implementation/field-rules-studio/publish-gate-retirement-roadmap.md

/**
 * @param {object} fieldRule — compiled field rule object
 * @returns {boolean} true if unk values should block publishing for this field
 */
export function shouldBlockUnkPublish(fieldRule) {
  const level = fieldRule?.priority?.required_level || '';
  return level === 'mandatory';
}
