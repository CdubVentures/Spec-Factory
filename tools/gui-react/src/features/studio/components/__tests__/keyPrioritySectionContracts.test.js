import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderNode(node) {
  if (Array.isArray(node)) {
    return node.map(renderNode);
  }
  if (node == null || typeof node !== 'object') {
    return node;
  }
  if (node.type === Symbol.for('fragment')) {
    return renderNode(node.props?.children);
  }
  if (typeof node.type === 'function') {
    return renderNode(node.type(node.props || {}));
  }
  const children = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderNode(node.props.children)
    : node.props?.children;
  return {
    ...node,
    props: {
      ...(node.props || {}),
      children,
    },
  };
}

function collectNodes(node, predicate, results = []) {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectNodes(child, predicate, results);
    }
    return results;
  }
  if (node == null || typeof node !== 'object') {
    return results;
  }
  if (predicate(node)) {
    results.push(node);
  }
  collectNodes(node.props?.children, predicate, results);
  return results;
}

function textContent(node) {
  if (Array.isArray(node)) {
    return node.map(textContent).join('');
  }
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node !== 'object') {
    return String(node);
  }
  return textContent(node.props?.children);
}

async function loadKeyPrioritySection() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/KeyPrioritySection.tsx',
    {
      prefix: 'key-priority-section-',
      stubs: {
        'react/jsx-runtime': `
          export function jsx(type, props) {
            return { type, props: props || {} };
          }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        '../Section.tsx': `
          export function Section(props) {
            return { type: 'Section', props };
          }
        `,
        '../../../../shared/ui/feedback/Tip.tsx': `
          export function Tip(props) {
            return { type: 'Tip', props };
          }
        `,
        '../studioConstants.ts': `
          export const selectCls = 'select';
          export const inputCls = 'input';
          export const labelCls = 'label';
          export const STUDIO_TIPS = {
            key_section_priority: 'priority',
            key_section_ai_assist: 'ai assist',
            required_level: 'required',
            availability: 'availability',
            difficulty: 'difficulty',
            ai_reasoning_note: 'reasoning note',
            variant_inventory_usage: 'variant inventory',
            pif_priority_images: 'pif priority images',
          };
        `,
        '../../../../registries/fieldRuleTaxonomy.ts': `
          export const REQUIRED_LEVEL_OPTIONS = ['mandatory', 'non_mandatory'];
          export const AVAILABILITY_OPTIONS = ['always', 'sometimes', 'rare'];
          export const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard', 'very_hard'];
        `,
      },
    },
  );
}

function createProps(overrides = {}) {
  const updates = [];
  return {
    props: {
      selectedKey: 'design',
      category: 'mouse',
      currentRule: {
        priority: {
          required_level: 'mandatory',
          availability: 'sometimes',
          difficulty: 'hard',
        },
        contract: {
          type: 'string',
          shape: 'scalar',
        },
        ai_assist: {
          reasoning_note: 'Prefer official design descriptions.',
          variant_inventory_usage: {
            enabled: true,
          },
          pif_priority_images: {
            enabled: false,
          },
        },
        ...overrides.currentRule,
      },
      updateField(key, path, value) {
        updates.push({ key, path, value });
      },
      BadgeRenderer({ p }) {
        return { type: 'Badge', props: { p } };
      },
      saveIfAutoSaveEnabled() {},
      disabled: false,
    },
    updates,
  };
}

test('KeyPrioritySection separates Priority from Ai Assist', async () => {
  const { KeyPrioritySection } = await loadKeyPrioritySection();
  const { props } = createProps();
  const tree = renderNode(KeyPrioritySection(props));
  const sections = collectNodes(tree, (node) => node.type === 'Section');

  assert.equal(sections.length, 2);
  assert.equal(sections[0].props.title, 'Priority');
  assert.equal(sections[1].props.title, 'Ai Assist');
  assert.equal(sections[0].props.persistKey, 'studio:keyNavigator:section:priority:mouse');
  assert.equal(sections[1].props.persistKey, 'studio:keyNavigator:section:aiAssist:mouse');

  assert.equal(textContent(sections[0]).includes('Extraction Guidance'), false);
  assert.ok(textContent(sections[1]).includes('Extraction Guidance'));
  assert.ok(textContent(sections[1]).includes('Variant Inventory Context'));
  assert.ok(textContent(sections[1]).includes('PIF Priority Images'));
});

test('KeyPrioritySection wires simple AI Assist injection controls to ai_assist paths', async () => {
  const { KeyPrioritySection } = await loadKeyPrioritySection();
  const { props, updates } = createProps();
  const tree = renderNode(KeyPrioritySection(props));

  const enabledToggle = collectNodes(
    tree,
    (node) => node.props?.['aria-label'] === 'Use variant inventory context',
  )[0];
  assert.equal(enabledToggle.props.checked, true);
  assert.equal(
    collectNodes(
      tree,
      (node) => node.props?.['aria-label'] === 'Variant inventory behavior',
    ).length,
    0,
  );
  assert.equal(
    collectNodes(
      tree,
      (node) => node.props?.['aria-label'] === 'Variant inventory profile',
    ).length,
    0,
  );
  assert.equal(
    collectNodes(
      tree,
      (node) => node.props?.['aria-label'] === 'Variant inventory instructions',
    ).length,
    0,
  );
  assert.equal(
    collectNodes(
      tree,
      (node) => node.type === 'Badge' && node.props?.p === 'ai_assist.variant_inventory_usage',
    ).length,
    1,
  );

  const pifImagesToggle = collectNodes(
    tree,
    (node) => node.props?.['aria-label'] === 'Use PIF priority images',
  )[0];
  assert.equal(pifImagesToggle.props.checked, false);
  assert.equal(
    collectNodes(
      tree,
      (node) => node.type === 'Badge' && node.props?.p === 'ai_assist.pif_priority_images',
    ).length,
    1,
  );

  enabledToggle.props.onChange({ target: { checked: false } });
  pifImagesToggle.props.onChange({ target: { checked: true } });

  assert.deepEqual(updates, [
    {
      key: 'design',
      path: 'ai_assist.variant_inventory_usage',
      value: { enabled: false },
    },
    {
      key: 'design',
      path: 'ai_assist.pif_priority_images',
      value: { enabled: true },
    },
  ]);
});
