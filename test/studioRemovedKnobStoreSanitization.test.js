import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadFieldRulesStore() {
  const esbuild = await import('esbuild');
  const srcPath = path.resolve(__dirname, '..', 'tools', 'gui-react', 'src', 'features', 'studio', 'state', 'useFieldRulesStore.ts');
  const result = await esbuild.build({
    entryPoints: [srcPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts' },
  });
  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'field-rules-store-'));
  const tmpFile = path.join(tmpDir, 'useFieldRulesStore.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');
  const mod = await import(`file://${tmpFile.replace(/\\/g, '/')}`);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return mod;
}

test('field rules store preserves non-indexlab knobs through hydrate, update, and snapshot', async () => {
  const { useFieldRulesStore } = await loadFieldRulesStore();
  useFieldRulesStore.getState().reset();

  useFieldRulesStore.getState().hydrate(
    {
      weight: {
        contract: {
          type: 'number',
          rounding: {
            decimals: 2,
            mode: 'floor',
          },
        },
        rounding_decimals: 2,
        round: 2,
        rounding_mode: 'floor',
        priority: {
          publish_gate: true,
          block_publish_when_unk: true,
        },
        publish_gate: true,
        parse: {
          template: 'number_with_unit',
          unit: 'g',
          unit_accepts: ['g', 'grams'],
        },
      },
    },
    ['weight'],
  );

  let snap = useFieldRulesStore.getState().getSnapshot();
  let rule = snap.rules.weight;

  assert.equal(rule.contract?.rounding?.decimals, 2, 'hydrate should preserve contract.rounding.decimals');
  assert.equal(rule.contract?.rounding?.mode, 'floor', 'hydrate should preserve contract.rounding.mode');
  assert.equal(rule.rounding_decimals, 2, 'hydrate should preserve legacy rounding_decimals alias');
  assert.equal(rule.round, 2, 'hydrate should preserve legacy round alias');
  assert.equal(rule.rounding_mode, 'floor', 'hydrate should preserve legacy rounding_mode alias');
  assert.equal(rule.priority?.publish_gate, true, 'hydrate should preserve priority.publish_gate');
  assert.equal(rule.publish_gate, true, 'hydrate should preserve legacy publish_gate alias');
  assert.equal(rule.parse?.unit, 'g', 'hydrate should preserve parse.unit');
  assert.deepEqual(rule.parse?.unit_accepts, ['g', 'grams'], 'hydrate should preserve wired parse.unit_accepts');
  assert.equal(rule.priority?.block_publish_when_unk, true, 'hydrate should preserve wired publish blocker');

  useFieldRulesStore.getState().updateField('weight', 'priority.publish_gate', true);
  useFieldRulesStore.getState().updateField('weight', 'parse.unit', 'lb');
  useFieldRulesStore.getState().updateField('weight', 'contract.rounding.mode', 'ceil');

  snap = useFieldRulesStore.getState().getSnapshot();
  rule = snap.rules.weight;

  assert.equal(rule.priority?.publish_gate, true, 'updateField should preserve priority.publish_gate');
  assert.equal(rule.parse?.unit, 'lb', 'updateField should preserve parse.unit updates');
  assert.equal(rule.contract?.rounding?.mode, 'ceil', 'updateField should preserve contract.rounding.mode updates');

  useFieldRulesStore.getState().addKey(
    'flow_rate',
    {
      contract: {
        type: 'number',
        rounding: {
          decimals: 1,
          mode: 'nearest',
        },
      },
      priority: {
        publish_gate: true,
      },
      publish_gate: true,
      parse: {
        template: 'number_with_unit',
        unit: 'l/s',
        unit_accepts: ['l/s'],
      },
    },
    'weight',
  );

  snap = useFieldRulesStore.getState().getSnapshot();
  rule = snap.rules.flow_rate;

  assert.equal(rule.contract?.rounding?.decimals, 1, 'addKey should preserve contract.rounding.decimals');
  assert.equal(rule.contract?.rounding?.mode, 'nearest', 'addKey should preserve contract.rounding.mode');
  assert.equal(rule.priority?.publish_gate, true, 'addKey should preserve priority.publish_gate');
  assert.equal(rule.publish_gate, true, 'addKey should preserve legacy publish_gate alias');
  assert.equal(rule.parse?.unit, 'l/s', 'addKey should preserve parse.unit');
  assert.deepEqual(rule.parse?.unit_accepts, ['l/s'], 'addKey should preserve parse.unit_accepts');
});
