import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_STUDIO_PATCH_FILE_SUFFIX,
  KEY_ORDER_PATCH_FILE_SUFFIX,
  buildFieldStudioPatchImportRequest,
  resolveFieldStudioPatchChangeKey,
  summarizeFieldStudioPatchImportPreview,
} from '../fieldStudioPatchImport.ts';

describe('field studio patch import client helpers', () => {
  it('reads one or many dropped JSON files into the strict upload request shape', async () => {
    const request = await buildFieldStudioPatchImportRequest([
      {
        name: `mouse-45-lift${FIELD_STUDIO_PATCH_FILE_SUFFIX}`,
        text: async () => '{"schema_version":"field-studio-patch.v1"}',
      },
      {
        name: `mouse-46-sensor${FIELD_STUDIO_PATCH_FILE_SUFFIX}`,
        text: async () => '{"schema_version":"field-studio-patch.v1"}',
      },
    ]);

    assert.deepEqual(request, {
      kind: 'field_studio_patch',
      files: [
        {
          fileName: `mouse-45-lift${FIELD_STUDIO_PATCH_FILE_SUFFIX}`,
          content: '{"schema_version":"field-studio-patch.v1"}',
        },
        {
          fileName: `mouse-46-sensor${FIELD_STUDIO_PATCH_FILE_SUFFIX}`,
          content: '{"schema_version":"field-studio-patch.v1"}',
        },
      ],
    });
  });

  it('detects a key-order patch request from the strict JSON schema', async () => {
    const request = await buildFieldStudioPatchImportRequest([
      {
        name: `mouse-keys-order${KEY_ORDER_PATCH_FILE_SUFFIX}`,
        text: async () => '{"schema_version":"key-order-patch.v1"}',
      },
    ]);

    assert.deepEqual(request, {
      kind: 'key_order_patch',
      files: [
        {
          fileName: `mouse-keys-order${KEY_ORDER_PATCH_FILE_SUFFIX}`,
          content: '{"schema_version":"key-order-patch.v1"}',
        },
      ],
    });
  });

  it('rejects mixed auditor JSON schema uploads before preview', async () => {
    await assert.rejects(
      () => buildFieldStudioPatchImportRequest([
        {
          name: `mouse-45-lift${FIELD_STUDIO_PATCH_FILE_SUFFIX}`,
          text: async () => '{"schema_version":"field-studio-patch.v1"}',
        },
        {
          name: `mouse-keys-order${KEY_ORDER_PATCH_FILE_SUFFIX}`,
          text: async () => '{"schema_version":"key-order-patch.v1"}',
        },
      ]),
      /not both at once/i,
    );
  });

  it('summarizes preview changes into counts shown by the modal', () => {
    const summary = summarizeFieldStudioPatchImportPreview({
      category: 'mouse',
      valid: true,
      files: [
        { fileName: 'mouse-45-lift.field-studio-patch.v1.json', fieldKey: 'lift', navigatorOrdinal: 45, verdict: 'minor_revise' },
        { fileName: 'mouse-46-switch_type.field-studio-patch.v1.json', fieldKey: 'switch_type', navigatorOrdinal: 46, verdict: 'major_revise' },
      ],
      changes: [
        { kind: 'field_override', action: 'updated', path: 'field_overrides.lift.ai_assist.reasoning_note', label: 'lift reasoning note', fieldKey: 'lift' },
        { kind: 'component_source', action: 'added', path: 'component_sources.switch', label: 'switch', componentType: 'switch' },
        { kind: 'data_list', action: 'updated', path: 'data_lists.lift', label: 'lift values', fieldKey: 'lift' },
      ],
      errors: [],
      warnings: ['normalized ok'],
    });

    assert.deepEqual(summary, {
      fileCount: 2,
      changeCount: 3,
      keyCount: 2,
      componentCount: 1,
      warningCount: 1,
      errorCount: 0,
    });
  });

  it('resolves the first preview column from field key, component type, then path', () => {
    assert.equal(
      resolveFieldStudioPatchChangeKey({
        kind: 'field_override',
        action: 'updated',
        path: 'field_overrides.lift.ai_assist.reasoning_note',
        label: 'lift reasoning note',
        fieldKey: 'lift',
      }),
      'lift',
    );

    assert.equal(
      resolveFieldStudioPatchChangeKey({
        kind: 'component_source',
        action: 'added',
        path: 'component_sources.switch',
        label: 'switch',
        componentType: 'switch',
      }),
      'component:switch',
    );

    assert.equal(
      resolveFieldStudioPatchChangeKey({
        kind: 'data_list',
        action: 'updated',
        path: 'data_lists.sensor_type',
        label: 'sensor_type values',
      }),
      'sensor_type',
    );
  });

  it('resolves key-order patch changes for the preview key column', () => {
    assert.equal(
      resolveFieldStudioPatchChangeKey({
        kind: 'key_added',
        key: 'lod_sync',
        groupKey: 'sensor_performance',
      }),
      'lod_sync',
    );

    assert.equal(
      resolveFieldStudioPatchChangeKey({
        kind: 'rename_proposed',
        from: 'lngth',
        to: 'length',
      }),
      'lngth -> length',
    );
  });
});
