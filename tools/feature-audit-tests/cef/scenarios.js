// 9 CEF validation scenarios expressed as data.
//
// Each scenario is a pure definition: products, canned LLM payloads, optional
// pre/post step hooks, and a finalAssertions() function that inspects the
// captured per-step results and emits a list of Check objects.
//
// Actual execution lives in run.js; this file is data + pure assertion logic.

// ── Check helper ───────────────────────────────────────────────────────────

function formatValue(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

export const check = (name, pass, actual, expected) => ({
  name,
  pass: Boolean(pass),
  actual: formatValue(actual),
  expected: formatValue(expected),
});

// ── Shared payload builders ────────────────────────────────────────────────

const emptyLog = {
  confirmed_from_known: [],
  added_new: [],
  rejected_from_known: [],
  urls_checked: [],
  queries_run: [],
};

function discovery({ colors, color_names = {}, editions = {}, default_color }) {
  return {
    colors,
    color_names,
    editions,
    default_color: default_color || colors[0],
    siblings_excluded: [],
    discovery_log: { ...emptyLog, added_new: colors },
  };
}

// Build a judge response that matches every registry entry structurally.
function judgeMatchAll(cefJson, { preferredLabels = {}, extraMappings = [], remove = [] } = {}) {
  const mappings = cefJson.variant_registry.map((e) => {
    const base = {
      new_key: e.variant_key,
      match: e.variant_id,
      action: 'match',
      reason: 'structural match',
      verified: true,
    };
    if (preferredLabels[e.variant_key]) base.preferred_label = preferredLabels[e.variant_key];
    return base;
  });
  return { mappings: [...mappings, ...extraMappings], remove, orphan_remaps: [] };
}

function findVariantId(cefJson, variantKey) {
  return cefJson.variant_registry.find((e) => e.variant_key === variantKey)?.variant_id;
}

// ── Product templates ──────────────────────────────────────────────────────

const prod = (productId, overrides = {}) => ({
  product_id: productId,
  category: 'mouse',
  brand: 'AuditBrand',
  base_model: '',
  model: 'AuditModel',
  variant: '',
  ...overrides,
});

// ── T1: Gate 1 Palette Rejection ───────────────────────────────────────────

const T1 = {
  id: 'T1',
  title: 'Palette Rejection (unknown atom)',
  description: 'LLM returns an atom not in the registered palette. Either the candidate gate (enum_value_not_allowed, closed enum) or Gate 1 (unknown_color_atom, variantRegistry palette check) rejects it before any registry write.',
  gate: 'Gate 1 / candidate gate',
  productId: 'mouse-t1',
  steps: [
    {
      label: 'Run 1 — plasma-violet forced',
      cannedDiscovery: discovery({
        colors: ['black', 'plasma-violet'],
        color_names: { 'plasma-violet': 'Plasma Violet Edition' },
      }),
      cannedJudge: null,
    },
  ],
  finalAssertions: ({ stepResults }) => {
    const { result, cefJson } = stepResults[0];
    const rejections = result.rejections || [];
    const acceptedCodes = ['enum_value_not_allowed', 'unknown_color_atom'];
    const codeMatched = rejections.some((r) => acceptedCodes.includes(r.reason_code));
    const mentionsBadAtom = JSON.stringify(rejections).includes('plasma-violet');
    return [
      check('run rejected', result.rejected === true, result.rejected, true),
      check('reason_code ∈ {enum_value_not_allowed, unknown_color_atom}', codeMatched, rejections.map((r) => r.reason_code), acceptedCodes),
      check('rejection references "plasma-violet"', mentionsBadAtom, mentionsBadAtom ? 'yes' : 'no', 'yes'),
      check('no variant_registry written', !cefJson.variant_registry || cefJson.variant_registry.length === 0, cefJson.variant_registry?.length ?? 0, 0),
      check('1 rejected run persisted', cefJson.runs?.length === 1 && cefJson.runs[0].status === 'rejected', `${cefJson.runs?.length ?? 0} run(s), status=${cefJson.runs?.[0]?.status}`, '1 run with status=rejected'),
    ];
  },
};

// ── T2: Gate 2 Judge Rejection ─────────────────────────────────────────────

const T2 = {
  id: 'T2',
  title: 'Gate 2 Judge Rejection (Hallucination Filter)',
  description: 'Run 2 discovery contains a palette-valid but product-wrong color. Judge rejects it; registry preserved with no new variant.',
  gate: 'Gate 2',
  productId: 'mouse-t2',
  steps: [
    {
      label: 'Run 1 — baseline black + white',
      cannedDiscovery: discovery({ colors: ['black', 'white'] }),
      cannedJudge: null,
    },
    {
      label: 'Run 2 — discovery adds pink, judge rejects',
      cannedDiscovery: discovery({ colors: ['black', 'white', 'pink'], color_names: { pink: 'Sakura Blossom Limited' } }),
      cannedJudge: ({ cefJson }) => {
        const blackId = findVariantId(cefJson, 'color:black');
        const whiteId = findVariantId(cefJson, 'color:white');
        return {
          mappings: [
            { new_key: 'color:black', match: blackId, action: 'match', reason: 'baseline match', verified: true },
            { new_key: 'color:white', match: whiteId, action: 'match', reason: 'baseline match', verified: true },
            { new_key: 'color:pink', match: null, action: 'reject', reason: 'not on official site — hallucination', verified: true },
          ],
          remove: [],
          orphan_remaps: [],
        };
      },
    },
  ],
  finalAssertions: ({ stepResults }) => {
    const step1 = stepResults[0];
    const step2 = stepResults[1];
    const reg = step2.cefJson.variant_registry;
    const run2 = step2.cefJson.runs[1];
    const pinkMapping = run2.response.identity_check?.mappings?.find((m) => m.new_key === 'color:pink');
    const step1Black = findVariantId(step1.cefJson, 'color:black');
    const step1White = findVariantId(step1.cefJson, 'color:white');
    const step2Black = findVariantId(step2.cefJson, 'color:black');
    const step2White = findVariantId(step2.cefJson, 'color:white');

    return [
      check('Run 2 succeeded (not rejected)', step2.result.rejected === false || step2.result.rejected === undefined, step2.result.rejected, false),
      check('registry has exactly 2 variants', reg.length === 2, reg.length, 2),
      check('pink is NOT in registry', !reg.some((e) => e.variant_key === 'color:pink'), reg.map((e) => e.variant_key), ['color:black', 'color:white']),
      check('judge marked pink action:reject', pinkMapping?.action === 'reject', pinkMapping?.action, 'reject'),
      check('black variant_id preserved across runs', step2Black === step1Black, `${step1Black} → ${step2Black}`, 'unchanged'),
      check('white variant_id preserved across runs', step2White === step1White, `${step1White} → ${step2White}`, 'unchanged'),
    ];
  },
};

// ── T3: Best Baseline (happy path) ─────────────────────────────────────────

const T3 = {
  id: 'T3',
  title: 'Best Baseline — Complete Discovery',
  description: 'Rich discovery with 3 colors + 1 edition. Full registry built, published state derived correctly.',
  gate: 'Happy path',
  productId: 'mouse-t3',
  steps: [
    {
      label: 'Run 1 — full discovery',
      cannedDiscovery: discovery({
        colors: ['black', 'white', 'black+red'],
        color_names: { black: 'Midnight' },
        editions: {
          'cyberpunk-edition': { display_name: 'Cyberpunk Edition', colors: ['black+red'] },
        },
      }),
      cannedJudge: null,
    },
  ],
  finalAssertions: ({ stepResults }) => {
    const { result, cefJson } = stepResults[0];
    const reg = cefJson.variant_registry;
    const keys = reg.map((e) => e.variant_key).sort();
    const editionEntry = reg.find((e) => e.variant_type === 'edition');
    return [
      check('run succeeded', result.rejected === false, result.rejected, false),
      check('registry has 3 variants', reg.length === 3, reg.length, 3),
      check('registry keys = [color:black, color:white, edition:cyberpunk-edition]', JSON.stringify(keys) === JSON.stringify(['color:black', 'color:white', 'edition:cyberpunk-edition']), keys, ['color:black', 'color:white', 'edition:cyberpunk-edition']),
      check('edition label is "Cyberpunk Edition"', editionEntry?.variant_label === 'Cyberpunk Edition', editionEntry?.variant_label, 'Cyberpunk Edition'),
      check('edition atoms = [black, red]', JSON.stringify(editionEntry?.color_atoms) === JSON.stringify(['black', 'red']), editionEntry?.color_atoms, ['black', 'red']),
      check('default_color is black', cefJson.selected?.default_color === 'black', cefJson.selected?.default_color, 'black'),
    ];
  },
};

// ── T4: Data Protected ─────────────────────────────────────────────────────

const T4 = {
  id: 'T4',
  title: 'Data Protected from Weak Run',
  description: 'Run 1 establishes 3 colors; Run 2 finds only one (simulated weak model). Judge matches what was found; existing variants preserved.',
  gate: 'Gate 2 (protection)',
  productId: 'mouse-t4',
  steps: [
    {
      label: 'Run 1 — strong baseline',
      cannedDiscovery: discovery({ colors: ['black', 'white', 'red'] }),
      cannedJudge: null,
    },
    {
      label: 'Run 2 — weak discovery finds only black',
      cannedDiscovery: discovery({ colors: ['black'] }),
      cannedJudge: ({ cefJson }) => ({
        mappings: [
          { new_key: 'color:black', match: findVariantId(cefJson, 'color:black'), action: 'match', reason: 'confirmed', verified: true },
        ],
        remove: [],
        orphan_remaps: [],
      }),
    },
  ],
  finalAssertions: ({ stepResults }) => {
    const step1 = stepResults[0];
    const step2 = stepResults[1];
    const reg1Ids = step1.cefJson.variant_registry.map((e) => e.variant_id).sort();
    const reg2Ids = step2.cefJson.variant_registry.map((e) => e.variant_id).sort();
    const run2 = step2.cefJson.runs[1];

    return [
      check('Run 2 succeeded', step2.result.rejected === false, step2.result.rejected, false),
      check('registry still has 3 variants', step2.cefJson.variant_registry.length === 3, step2.cefJson.variant_registry.length, 3),
      check('all Run 1 variant_ids preserved in Run 2', JSON.stringify(reg1Ids) === JSON.stringify(reg2Ids), reg2Ids, reg1Ids),
      check('judge remove[] is empty', (run2.response.identity_check?.remove || []).length === 0, run2.response.identity_check?.remove, []),
      check('white still in registry', step2.cefJson.variant_registry.some((e) => e.variant_key === 'color:white'), true, true),
      check('red still in registry', step2.cefJson.variant_registry.some((e) => e.variant_key === 'color:red'), true, true),
    ];
  },
};

// ── T5: Stability ──────────────────────────────────────────────────────────

const T5 = {
  id: 'T5',
  title: 'Stability — Same Data, No Churn',
  description: 'Two identical runs. Second run judge matches all. Registry must be byte-identical; no updated_at fields introduced.',
  gate: 'Stability',
  productId: 'mouse-t5',
  steps: [
    {
      label: 'Run 1',
      cannedDiscovery: discovery({ colors: ['black', 'white'] }),
      cannedJudge: null,
    },
    {
      label: 'Run 2 — identical',
      cannedDiscovery: discovery({ colors: ['black', 'white'] }),
      cannedJudge: ({ cefJson }) => judgeMatchAll(cefJson),
    },
  ],
  finalAssertions: ({ stepResults }) => {
    const reg1 = stepResults[0].cefJson.variant_registry;
    const reg2 = stepResults[1].cefJson.variant_registry;
    const idsEqual = JSON.stringify(reg1.map((e) => e.variant_id).sort()) === JSON.stringify(reg2.map((e) => e.variant_id).sort());
    const labelsEqual = reg1.every((e1) => {
      const e2 = reg2.find((x) => x.variant_id === e1.variant_id);
      return e2 && e2.variant_label === e1.variant_label;
    });
    const noUpdatedAt = reg2.every((e) => !e.updated_at);
    return [
      check('registry has 2 variants', reg2.length === 2, reg2.length, 2),
      check('variant_ids identical Run 1 → Run 2', idsEqual, reg2.map((e) => e.variant_id), reg1.map((e) => e.variant_id)),
      check('labels unchanged', labelsEqual, reg2.map((e) => e.variant_label), reg1.map((e) => e.variant_label)),
      check('no updated_at introduced (nothing changed)', noUpdatedAt, reg2.map((e) => e.updated_at ?? null), [null, null]),
    ];
  },
};

// ── T6: Label Upgrade ──────────────────────────────────────────────────────

const T6 = {
  id: 'T6',
  title: 'Label Upgrade via preferred_label',
  description: 'Run 2 judge provides preferred_label for each match. Registry labels update; variant_ids preserved; updated_at set.',
  gate: 'Label quality',
  productId: 'mouse-t6',
  steps: [
    {
      label: 'Run 1 — generic labels',
      cannedDiscovery: discovery({ colors: ['black', 'white'] }),
      cannedJudge: null,
    },
    {
      label: 'Run 2 — judge upgrades labels',
      cannedDiscovery: discovery({ colors: ['black', 'white'] }),
      cannedJudge: ({ cefJson }) => judgeMatchAll(cefJson, {
        preferredLabels: {
          'color:black': 'Midnight',
          'color:white': 'Arctic Frost',
        },
      }),
    },
  ],
  finalAssertions: ({ stepResults }) => {
    const reg1 = stepResults[0].cefJson.variant_registry;
    const reg2 = stepResults[1].cefJson.variant_registry;
    const black2 = reg2.find((e) => e.variant_key === 'color:black');
    const white2 = reg2.find((e) => e.variant_key === 'color:white');
    const idsEqual = JSON.stringify(reg1.map((e) => e.variant_id).sort()) === JSON.stringify(reg2.map((e) => e.variant_id).sort());
    return [
      check('variant_ids preserved', idsEqual, reg2.map((e) => e.variant_id), reg1.map((e) => e.variant_id)),
      check('black label upgraded to "Midnight"', black2?.variant_label === 'Midnight', black2?.variant_label, 'Midnight'),
      check('white label upgraded to "Arctic Frost"', white2?.variant_label === 'Arctic Frost', white2?.variant_label, 'Arctic Frost'),
      check('black has updated_at', Boolean(black2?.updated_at), !!black2?.updated_at, true),
      check('white has updated_at', Boolean(white2?.updated_at), !!white2?.updated_at, true),
    ];
  },
};

// ── T7: Progressive Enrichment ─────────────────────────────────────────────

const T7 = {
  id: 'T7',
  title: 'Progressive Enrichment — 3 Runs',
  description: 'Three runs of escalating discovery. Registry grows monotonically; variant_ids from earlier runs are stable; no removals.',
  gate: 'Accumulation',
  productId: 'mouse-t7',
  steps: [
    {
      label: 'Run 1 — 1 color',
      cannedDiscovery: discovery({ colors: ['black'] }),
      cannedJudge: null,
    },
    {
      label: 'Run 2 — add white',
      cannedDiscovery: discovery({ colors: ['black', 'white'] }),
      cannedJudge: ({ cefJson }) => ({
        mappings: [
          { new_key: 'color:black', match: findVariantId(cefJson, 'color:black'), action: 'match', reason: 'same', verified: true },
          { new_key: 'color:white', match: null, action: 'new', reason: 'verified new', verified: true },
        ],
        remove: [],
        orphan_remaps: [],
      }),
    },
    {
      label: 'Run 3 — add red',
      cannedDiscovery: discovery({ colors: ['black', 'white', 'red'] }),
      cannedJudge: ({ cefJson }) => ({
        mappings: [
          { new_key: 'color:black', match: findVariantId(cefJson, 'color:black'), action: 'match', reason: 'same', verified: true },
          { new_key: 'color:white', match: findVariantId(cefJson, 'color:white'), action: 'match', reason: 'same', verified: true },
          { new_key: 'color:red', match: null, action: 'new', reason: 'verified new', verified: true },
        ],
        remove: [],
        orphan_remaps: [],
      }),
    },
  ],
  finalAssertions: ({ stepResults }) => {
    const reg1 = stepResults[0].cefJson.variant_registry;
    const reg3 = stepResults[2].cefJson.variant_registry;
    const blackId1 = findVariantId(stepResults[0].cefJson, 'color:black');
    const whiteId2 = findVariantId(stepResults[1].cefJson, 'color:white');
    const allRemoveEmpty = stepResults.every((s) => {
      const runs = s.cefJson.runs || [];
      const latest = runs[runs.length - 1];
      return ((latest?.response?.identity_check?.remove) || []).length === 0;
    });
    return [
      check('registry has 3 variants after Run 3', reg3.length === 3, reg3.length, 3),
      check('registry grew monotonically (1 → 2 → 3)', stepResults[0].cefJson.variant_registry.length === 1 && stepResults[1].cefJson.variant_registry.length === 2 && stepResults[2].cefJson.variant_registry.length === 3, stepResults.map((s) => s.cefJson.variant_registry.length), [1, 2, 3]),
      check('black variant_id from Run 1 still present in Run 3', reg3.some((e) => e.variant_id === blackId1), blackId1, 'still present'),
      check('white variant_id from Run 2 still present in Run 3', reg3.some((e) => e.variant_id === whiteId2), whiteId2, 'still present'),
      check('remove[] empty on all runs', allRemoveEmpty, allRemoveEmpty, true),
    ];
  },
};

// ── T8: Wrong-Product Variant + PIF Cascade ────────────────────────────────

const T8 = {
  id: 'T8',
  title: 'Wrong-Product Variant Hard-Delete + PIF Cascade',
  description: 'Sibling-model color (amber) planted in Run 1 registry. Real PIF images seeded. Run 2 judge removes it; PIF cascade deletes associated images, carousel slots, and evaluations.',
  gate: 'PIF cascade',
  productId: 'mouse-t8',
  steps: [
    {
      label: 'Run 1 — plant amber + seed PIF',
      cannedDiscovery: discovery({
        colors: ['black', 'white', 'amber'],
        color_names: { 'amber': 'Sunset Haze' },
      }),
      cannedJudge: null,
      postStep: ({ cefJson, seedPif, productId }) => {
        // WHY: Seed PIF using the real variant_ids generated by Run 1 so the
        // cascade has something linked to cascade-delete.
        // amber is a hex-registered color name used as a stand-in for
        // a sibling-model contamination candidate (see T8 scenario description
        // in docs/features-html/cef-validation-tests.html).
        const blackId = findVariantId(cefJson, 'color:black');
        const whiteId = findVariantId(cefJson, 'color:white');
        const sunsetId = findVariantId(cefJson, 'color:amber');
        if (!sunsetId) return; // defensive; should never happen
        seedPif(productId, {
          selected: {
            images: [
              { filename: 'black-top.png', view: 'top', variant_id: blackId, variant_key: 'color:black', variant_label: 'black' },
              { filename: 'black-front.png', view: 'front', variant_id: blackId, variant_key: 'color:black', variant_label: 'black' },
              { filename: 'white-top.png', view: 'top', variant_id: whiteId, variant_key: 'color:white', variant_label: 'white' },
              { filename: 'white-front.png', view: 'front', variant_id: whiteId, variant_key: 'color:white', variant_label: 'white' },
              { filename: 'sunset-top.png', view: 'top', variant_id: sunsetId, variant_key: 'color:amber', variant_label: 'Sunset Haze' },
              { filename: 'sunset-front.png', view: 'front', variant_id: sunsetId, variant_key: 'color:amber', variant_label: 'Sunset Haze' },
            ],
          },
          carousel_slots: {
            'color:black': { top: 'black-top.png', front: 'black-front.png' },
            'color:white': { top: 'white-top.png', front: 'white-front.png' },
            'color:amber': { top: 'sunset-top.png', front: 'sunset-front.png' },
          },
          evaluations: [
            { variant_key: 'color:black', variant_id: blackId, type: 'view', view: 'top' },
            { variant_key: 'color:white', variant_id: whiteId, type: 'view', view: 'top' },
            { variant_key: 'color:amber', variant_id: sunsetId, type: 'view', view: 'top' },
            { variant_key: 'color:amber', variant_id: sunsetId, type: 'view', view: 'front' },
          ],
        });
      },
    },
    {
      label: 'Run 2 — judge removes amber',
      cannedDiscovery: discovery({ colors: ['black', 'white'] }),
      cannedJudge: ({ cefJson }) => {
        const blackId = findVariantId(cefJson, 'color:black');
        const whiteId = findVariantId(cefJson, 'color:white');
        const sunsetId = findVariantId(cefJson, 'color:amber');
        return {
          mappings: [
            { new_key: 'color:black', match: blackId, action: 'match', reason: 'confirmed', verified: true },
            { new_key: 'color:white', match: whiteId, action: 'match', reason: 'confirmed', verified: true },
          ],
          remove: [sunsetId],
          orphan_remaps: [],
        };
      },
    },
  ],
  finalAssertions: ({ stepResults }) => {
    const step1 = stepResults[0];
    const step2 = stepResults[1];
    const reg2 = step2.cefJson.variant_registry;
    const pif2 = step2.pifJson;
    const step1BlackId = findVariantId(step1.cefJson, 'color:black');
    const step2BlackId = findVariantId(step2.cefJson, 'color:black');
    const sunsetInReg = reg2.some((e) => e.variant_key === 'color:amber');
    const sunsetImages = (pif2?.selected?.images || []).filter((i) => i.variant_key === 'color:amber');
    const surviveImages = (pif2?.selected?.images || []).filter((i) => i.variant_key === 'color:black' || i.variant_key === 'color:white');
    const sunsetEvals = (pif2?.evaluations || []).filter((e) => e.variant_key === 'color:amber');

    return [
      check('Run 2 succeeded', step2.result.rejected === false, step2.result.rejected, false),
      check('amber removed from CEF registry', !sunsetInReg, sunsetInReg, false),
      check('registry has 2 variants (black, white)', reg2.length === 2, reg2.length, 2),
      check('black variant_id preserved', step2BlackId === step1BlackId, `${step1BlackId} → ${step2BlackId}`, 'unchanged'),
      check('PIF: 4 surviving images (2 black + 2 white)', surviveImages.length === 4, surviveImages.length, 4),
      check('PIF: 0 amber images remain', sunsetImages.length === 0, sunsetImages.length, 0),
      check('PIF: carousel_slots has 2 keys (amber gone)', Object.keys(pif2?.carousel_slots || {}).sort().join(',') === 'color:black,color:white', Object.keys(pif2?.carousel_slots || {}), ['color:black', 'color:white']),
      check('PIF: 2 evaluations remain (amber evals gone)', (pif2?.evaluations || []).length === 2, pif2?.evaluations?.length, 2),
      check('PIF: 0 amber evaluations', sunsetEvals.length === 0, sunsetEvals.length, 0),
    ];
  },
};

// ── T9: Discontinued Variant Preserved ─────────────────────────────────────

const T9 = {
  id: 'T9',
  title: 'Discontinued Variant Preserved',
  description: 'Run 1 registers a real-but-discontinued color (red). Run 2 discovery misses it. Judge must NOT add it to remove[] — discontinued real products are preserved.',
  gate: 'Preservation',
  productId: 'mouse-t9',
  steps: [
    {
      label: 'Run 1 — 3 colors including "red" (discontinued)',
      cannedDiscovery: discovery({ colors: ['black', 'white', 'red'], color_names: { red: 'Launch Red' } }),
      cannedJudge: null,
    },
    {
      label: 'Run 2 — discovery misses red, judge preserves',
      cannedDiscovery: discovery({ colors: ['black', 'white'] }),
      cannedJudge: ({ cefJson }) => ({
        mappings: [
          { new_key: 'color:black', match: findVariantId(cefJson, 'color:black'), action: 'match', reason: 'confirmed', verified: true },
          { new_key: 'color:white', match: findVariantId(cefJson, 'color:white'), action: 'match', reason: 'confirmed', verified: true },
        ],
        remove: [],
        orphan_remaps: [],
      }),
    },
  ],
  finalAssertions: ({ stepResults }) => {
    const step1 = stepResults[0];
    const step2 = stepResults[1];
    const reg2 = step2.cefJson.variant_registry;
    const redPreserved = reg2.some((e) => e.variant_key === 'color:red');
    const redIdStep1 = findVariantId(step1.cefJson, 'color:red');
    const redIdStep2 = findVariantId(step2.cefJson, 'color:red');
    const run2 = step2.cefJson.runs[1];
    const removeArr = run2.response.identity_check?.remove || [];
    return [
      check('Run 2 succeeded', step2.result.rejected === false, step2.result.rejected, false),
      check('registry still has 3 variants', reg2.length === 3, reg2.length, 3),
      check('red still present in registry', redPreserved, redPreserved, true),
      check('red variant_id preserved', redIdStep1 === redIdStep2 && !!redIdStep1, `${redIdStep1} → ${redIdStep2}`, 'unchanged'),
      check('judge remove[] empty', removeArr.length === 0, removeArr, []),
    ];
  },
};

// ── Export ordered list ────────────────────────────────────────────────────

export const SCENARIOS = [T1, T2, T3, T4, T5, T6, T7, T8, T9];
