import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPipelineStageBatches,
  getRunnablePipelineStageIds,
  classifyPipelineKfBucket,
  type PipelineStageId,
} from '../pipelinePlan.ts';

describe('Overview pipeline dependency plan', () => {
  it('declares the fastest dependency-safe stage batches', () => {
    assert.deepEqual(getPipelineStageBatches(), [
      ['cef_1', 'kf_early'],
      ['cef_2'],
      ['pif_dep', 'rdf_run', 'sku_run'],
      ['pif_loop'],
      ['pif_eval'],
      ['kf_context'],
    ]);
  });

  it('unlocks RDF and SKU beside PIF dependency work after CEF is complete', () => {
    const completed = new Set<PipelineStageId>(['cef_1', 'cef_2']);
    const running = new Set<PipelineStageId>(['kf_early']);

    assert.deepEqual(
      getRunnablePipelineStageIds({ completed, running }),
      ['pif_dep', 'rdf_run', 'sku_run'],
    );
  });

  it('keeps PIF loop gated by dependency completion', () => {
    const completed = new Set<PipelineStageId>(['cef_1', 'cef_2', 'rdf_run', 'sku_run']);

    assert.equal(
      getRunnablePipelineStageIds({ completed, running: new Set() }).includes('pif_loop'),
      false,
    );

    completed.add('pif_dep');
    assert.equal(
      getRunnablePipelineStageIds({ completed, running: new Set() }).includes('pif_loop'),
      true,
    );
  });

  it('classifies KF prompt dependencies without category-specific keys', () => {
    assert.equal(
      classifyPipelineKfBucket({
        field_key: 'static_key',
        uses_variant_inventory: false,
        uses_pif_priority_images: false,
        product_image_dependent: false,
      }, new Set()),
      'early',
    );
    assert.equal(
      classifyPipelineKfBucket({
        field_key: 'context_key',
        uses_variant_inventory: true,
        uses_pif_priority_images: false,
        product_image_dependent: false,
      }, new Set()),
      'contextual',
    );
    assert.equal(
      classifyPipelineKfBucket({
        field_key: 'visual_key',
        uses_variant_inventory: false,
        uses_pif_priority_images: true,
        product_image_dependent: false,
      }, new Set()),
      'contextual',
    );
    assert.equal(
      classifyPipelineKfBucket({
        field_key: 'connection',
        uses_variant_inventory: true,
        uses_pif_priority_images: false,
        product_image_dependent: true,
      }, new Set()),
      'pif-dependency',
    );
    assert.equal(
      classifyPipelineKfBucket({
        field_key: 'sku',
        uses_variant_inventory: false,
        uses_pif_priority_images: false,
        product_image_dependent: false,
      }, new Set(['sku'])),
      'excluded',
    );
  });
});
