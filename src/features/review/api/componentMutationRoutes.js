import fs from 'node:fs';
import path from 'node:path';

import {
  createRouteResponder,
  ensureSeededSpecDb,
  prepareMutationContextRequest,
  respondIfError,
  routeMatches,
  runHandledRouteChain,
  sendDataChangeResponse,
} from './routeSharedHelpers.js';
import { clearPublishedField } from '../../publisher/publish/clearPublishedField.js';
import { wipePublisherStateForUnpub } from '../../publisher/publish/wipePublisherStateForUnpub.js';
import { defaultProductRoot } from '../../../core/config/runtimeArtifactRoots.js';
import { renamePublishedComponentIdentityFields } from '../services/componentPublishedFields.js';
import { mirrorComponentIdentityOverride } from '../services/componentOverrideMirror.js';

import {
  validateComponentPropertyCandidate,
  runComponentIdentityUpdateTx,
  isIdentityPropertyKey,
  normalizeStringEntries,
  parseJsonArray,
  cascadeComponentMutation,
  respondMissingComponentIdentityId,
  buildComponentMutationContextArgs,
  resolveComponentIdentityMutationPlan,
  clearComponentValueAcceptedCandidate,
  replaceComponentUserAliases,
  updateComponentLinks,
  updateComponentReviewStatus,
  updateComponentValueNeedsReview,
} from '../services/componentMutationService.js';

// Re-export for characterization tests and any external consumers
export {
  validateComponentPropertyCandidate,
  runComponentIdentityUpdateTx,
  isIdentityPropertyKey,
  normalizeStringEntries,
  parseJsonArray,
  cascadeComponentMutation,
  respondMissingComponentIdentityId,
  buildComponentMutationContextArgs,
  resolveComponentIdentityMutationPlan,
  clearComponentValueAcceptedCandidate,
  replaceComponentUserAliases,
  updateComponentLinks,
  updateComponentReviewStatus,
  updateComponentValueNeedsReview,
};

function toPositiveId(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  return id > 0 ? id : null;
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function productJsonPath(productRoot, productId) {
  return path.join(productRoot, productId, 'product.json');
}

function addIdentityFields(fields, baseField) {
  const key = String(baseField || '').trim();
  if (!key) return;
  fields.add(key);
  fields.add(`${key}_brand`);
  fields.add(`${key}_link`);
}

function groupIdentityFieldsByProduct({ componentType, linkedProducts }) {
  const byProduct = new Map();
  for (const linkedProduct of linkedProducts || []) {
    const productId = String(linkedProduct?.product_id || '').trim();
    if (!productId) continue;
    const fields = byProduct.get(productId) || new Set();
    addIdentityFields(fields, linkedProduct?.field_key || componentType);
    byProduct.set(productId, fields);
  }
  return byProduct;
}

function unpublishIdentityField({ runtimeSpecDb, productId, fieldKey, productJson }) {
  if (!productJson) {
    runtimeSpecDb.demoteResolvedCandidates?.(productId, fieldKey, null);
    wipePublisherStateForUnpub({ specDb: runtimeSpecDb, productId, fieldKey });
    return { status: 'cleared_without_json' };
  }
  const result = clearPublishedField({
    specDb: runtimeSpecDb,
    productId,
    fieldKey,
    productJson,
  });
  if (result.status !== 'cleared') {
    runtimeSpecDb.demoteResolvedCandidates?.(productId, fieldKey, null);
    wipePublisherStateForUnpub({ specDb: runtimeSpecDb, productId, fieldKey });
  }
  return result;
}

function unpublishComponentIdentityFields({ runtimeSpecDb, productRoot, componentType, linkedProducts }) {
  const byProduct = groupIdentityFieldsByProduct({ componentType, linkedProducts });
  const results = [];
  for (const [productId, fields] of byProduct.entries()) {
    const filePath = productJsonPath(productRoot, productId);
    const productJson = safeReadJson(filePath);
    let changed = false;
    for (const fieldKey of fields) {
      const result = unpublishIdentityField({ runtimeSpecDb, productId, fieldKey, productJson });
      if (result.status === 'cleared') changed = true;
      results.push({ productId, fieldKey, status: result.status });
    }
    if (changed && productJson) {
      writeJson(filePath, productJson);
    }
  }
  return results;
}

async function handleComponentIdentityDeleteEndpoint({
  parts,
  method,
  res,
  context,
}) {
  if (
    !Array.isArray(parts)
    || parts[0] !== 'review-components'
    || !parts[1]
    || parts[2] !== 'components'
    || !parts[3]
    || parts[4] !== 'identity'
    || !parts[5]
    || method !== 'DELETE'
  ) {
    return false;
  }

  const {
    jsonRes,
    getSpecDbReady,
    storage,
    specDbCache,
    broadcastWs,
  } = context || {};
  const respond = createRouteResponder(jsonRes, res);
  const category = parts[1];
  const componentType = String(parts[3] || '').trim();
  const componentIdentityId = toPositiveId(parts[5]);
  if (!componentIdentityId) {
    return respond(400, {
      error: 'component_identity_id_required',
      message: 'component identity id is required for component row delete.',
    });
  }

  const readySpecDb = await ensureSeededSpecDb({ category, getSpecDbReady });
  if (respondIfError(respond, readySpecDb.error)) {
    return true;
  }
  const runtimeSpecDb = readySpecDb.runtimeSpecDb;
  const identity = runtimeSpecDb.getComponentIdentityById(componentIdentityId);
  if (!identity || String(identity.component_type || '').trim() !== componentType) {
    return respond(404, {
      error: 'component_identity_id_not_found',
      message: `component identity '${componentIdentityId}' does not resolve for '${componentType}'.`,
    });
  }

  try {
    const deleted = runtimeSpecDb.deleteComponentIdentityCascade(componentIdentityId);
    const linkedProducts = deleted.linkedProducts || [];
    const productRoot = storage?.productRoot || defaultProductRoot();
    const unpublishResults = unpublishComponentIdentityFields({
      runtimeSpecDb,
      productRoot,
      componentType,
      linkedProducts,
    });
    specDbCache?.delete?.(category);
    const productIds = Array.from(new Set(linkedProducts.map((row) => String(row?.product_id || '').trim()).filter(Boolean)));
    const fieldKeys = Array.from(new Set(unpublishResults.map((row) => String(row?.fieldKey || '').trim()).filter(Boolean)));
    return sendDataChangeResponse({
      jsonRes,
      res,
      broadcastWs,
      eventType: 'component-row-deleted',
      category,
      domains: ['component', 'review', 'product', 'publisher', 'key-finder'],
      entities: { productIds, fieldKeys },
      meta: {
        componentIdentityId,
        componentType,
        productIds,
        fieldKeys,
      },
      payload: {
        status: 'deleted',
        component_identity_id: componentIdentityId,
        component_type: componentType,
        unlinked_products: productIds.length,
        cleared_fields: unpublishResults,
        deleted_aliases: deleted.aliases,
        deleted_values: deleted.values,
        deleted_links: deleted.links,
      },
    });
  } catch (err) {
    return respond(500, {
      error: 'component_row_delete_failed',
      message: err?.message || 'Component row delete failed.',
    });
  }
}

async function handleComponentTypeIdentitiesDeleteEndpoint({
  parts,
  method,
  res,
  context,
}) {
  if (
    !Array.isArray(parts)
    || parts[0] !== 'review-components'
    || !parts[1]
    || parts[2] !== 'components'
    || !parts[3]
    || parts[4] !== 'identities'
    || method !== 'DELETE'
  ) {
    return false;
  }

  const {
    jsonRes,
    getSpecDbReady,
    storage,
    specDbCache,
    broadcastWs,
  } = context || {};
  const respond = createRouteResponder(jsonRes, res);
  const category = parts[1];
  const componentType = String(parts[3] || '').trim();
  if (!componentType) {
    return respond(400, {
      error: 'component_type_required',
      message: 'component type is required for component type delete.',
    });
  }

  const readySpecDb = await ensureSeededSpecDb({ category, getSpecDbReady });
  if (respondIfError(respond, readySpecDb.error)) {
    return true;
  }
  const runtimeSpecDb = readySpecDb.runtimeSpecDb;

  try {
    const identities = runtimeSpecDb.getAllComponentIdentities(componentType) || [];
    const deletedRows = identities
      .map((identity) => runtimeSpecDb.deleteComponentIdentityCascade(identity.id))
      .filter((deleted) => deleted?.deleted);
    const linkedProducts = deletedRows.flatMap((deleted) => deleted.linkedProducts || []);
    const productRoot = storage?.productRoot || defaultProductRoot();
    const unpublishResults = unpublishComponentIdentityFields({
      runtimeSpecDb,
      productRoot,
      componentType,
      linkedProducts,
    });
    specDbCache?.delete?.(category);
    const productIds = Array.from(new Set(linkedProducts.map((row) => String(row?.product_id || '').trim()).filter(Boolean)));
    const fieldKeys = Array.from(new Set(unpublishResults.map((row) => String(row?.fieldKey || '').trim()).filter(Boolean)));
    return sendDataChangeResponse({
      jsonRes,
      res,
      broadcastWs,
      eventType: 'component-rows-deleted',
      category,
      domains: ['component', 'review', 'product', 'publisher', 'key-finder'],
      entities: { productIds, fieldKeys },
      meta: {
        componentType,
        deletedIdentityIds: deletedRows.map((deleted) => deleted.identity?.id).filter(Boolean),
        productIds,
        fieldKeys,
      },
      payload: {
        status: 'deleted',
        component_type: componentType,
        deleted_identities: deletedRows.length,
        unlinked_products: productIds.length,
        cleared_fields: unpublishResults,
        deleted_aliases: deletedRows.reduce((sum, deleted) => sum + (deleted.aliases || 0), 0),
        deleted_values: deletedRows.reduce((sum, deleted) => sum + (deleted.values || 0), 0),
        deleted_links: deletedRows.reduce((sum, deleted) => sum + (deleted.links || 0), 0),
      },
    });
  } catch (err) {
    return respond(500, {
      error: 'component_type_delete_failed',
      message: err?.message || 'Component type delete failed.',
    });
  }
}

async function handleComponentOverrideEndpoint({
  parts,
  method,
  req,
  res,
  context,
}) {
  const {
    readJsonBody,
    jsonRes,
    getSpecDbReady,
    resolveComponentMutationContext,
    isMeaningfulValue,
    normalizeLower,
    buildComponentIdentifier,
    cascadeComponentChange,
    config,
    outputRoot,
    storage,
    specDbCache,
    broadcastWs,
  } = context || {};
  const respond = createRouteResponder(jsonRes, res);

  // Component property override
  if (routeMatches({ parts, method, scope: 'review-components', action: 'component-override' })) {
    const preparedMutation = await prepareMutationContextRequest({
      parts,
      req,
      readJsonBody,
      getSpecDbReady,
      resolveContext: resolveComponentMutationContext,
      resolveContextArgs: buildComponentMutationContextArgs,
    });
    if (respondIfError(respond, preparedMutation.error)) {
      return true;
    }
    const {
      category,
      body,
      runtimeSpecDb,
      context: componentCtx,
    } = preparedMutation;
    const { review_status, candidateId, candidateSource } = body;
    const value = body?.value;
    const componentType = String(componentCtx?.componentType || '').trim();
    const name = String(componentCtx?.componentName || '').trim();
    const componentMaker = String(componentCtx?.componentMaker || '').trim();
    const property = String(componentCtx?.property || body?.property || body?.propertyKey || '').trim();
    const componentIdentityId = componentCtx?.componentIdentityId ?? null;
    if (!componentType || !name) {
      return respond(400, {
        error: 'component_context_required',
        message: 'Provide required component slot identifiers.',
      });
    }

    // SQL-first runtime path (legacy JSON override files removed from the write path)
    try {
      const nowIso = new Date().toISOString();
      const requestedCandidateId = String(candidateId || '').trim() || null;
      let acceptedCandidateId = requestedCandidateId;
      const sourceToken = String(candidateSource || '').trim().toLowerCase();
      const resolveSelectionSource = () => {
        if (!requestedCandidateId) return 'user';
        const candidateLooksUser = sourceToken.includes('manual') || sourceToken.includes('user');
        if (candidateLooksUser) return 'user';
        return 'pipeline';
      };
      const selectedSource = resolveSelectionSource();
      const cascadeBase = {
        cascadeComponentChange,
        storage,
        outputRoot,
        category,
        runtimeSpecDb,
      };

      if (property && value !== undefined) {
        const isIdentity = isIdentityPropertyKey(property);
        const valueToken = String(value ?? '').trim();
        if (requestedCandidateId && !isMeaningfulValue(valueToken)) {
          return respond(400, {
            error: 'unknown_value_not_actionable',
            message: 'Candidate accept cannot persist unknown/empty values.',
          });
        }

        if (!isIdentity) {
          const existingProperty = (
            componentCtx?.componentValueRow
            && String(componentCtx.componentValueRow.property_key || '').trim() === String(property || '').trim()
          )
            ? componentCtx.componentValueRow
            : null;
          if (!existingProperty?.id) {
            return respond(400, {
              error: 'component_value_id_required',
              message: 'componentValueId is required for component property mutations.',
            });
          }
          const componentIdentifier = buildComponentIdentifier(componentType, name, componentMaker);
          const keepNeedsReview = acceptedCandidateId ? Boolean(existingProperty?.needs_review) : false;
          const parsedConstraints = parseJsonArray(existingProperty?.constraints);
          runtimeSpecDb.upsertComponentValue({
            componentType,
            componentName: name,
            componentMaker,
            propertyKey: property,
            value: String(value),
            confidence: 1.0,
            variancePolicy: existingProperty?.variance_policy ?? null,
            source: selectedSource,
            acceptedCandidateId: acceptedCandidateId || null,
            overridden: !acceptedCandidateId,
            needsReview: keepNeedsReview,
            constraints: parsedConstraints,
          });
          const componentSlotId = componentCtx?.componentValueId ?? existingProperty.id;

          if (!acceptedCandidateId) {
            clearComponentValueAcceptedCandidate({ runtimeSpecDb, componentValueId: existingProperty.id });
          }

          await cascadeComponentMutation({
            ...cascadeBase,
            componentType,
            componentName: name,
            componentMaker,
            changedProperty: property,
            newValue: value,
            variancePolicy: existingProperty?.variance_policy ?? null,
            constraints: parsedConstraints,
          });
        } else if (property === '__aliases') {
          const aliases = normalizeStringEntries(value);
          if (respondMissingComponentIdentityId({ respond, componentIdentityId })) {
            return true;
          }
          if (componentIdentityId) {
            replaceComponentUserAliases({ runtimeSpecDb, componentIdentityId, aliases, componentType, name, componentMaker });
          }
        } else if (property === '__links') {
          const links = normalizeStringEntries(value);
          if (respondMissingComponentIdentityId({ respond, componentIdentityId })) {
            return true;
          }
          updateComponentLinks({ runtimeSpecDb, componentIdentityId, links });
        } else if (property === '__name' || property === '__maker') {
          const mutationPlan = resolveComponentIdentityMutationPlan({
            property,
            value,
            componentType,
            name,
            componentMaker,
          });
          if (mutationPlan?.errorPayload) {
            return respond(400, mutationPlan.errorPayload);
          }
          if (!mutationPlan) {
            return respond(400, {
              error: 'invalid_component_identity_property',
              message: `Unsupported component identity property '${property}'.`,
            });
          }
          if (respondMissingComponentIdentityId({ respond, componentIdentityId })) {
            return true;
          }
          const linkedProductsBeforeRename = runtimeSpecDb.getProductsForComponent?.(
            componentType,
            name,
            componentMaker,
          ) || [];
          runComponentIdentityUpdateTx({
            runtimeSpecDb,
            buildComponentIdentifier,
            componentType,
            currentName: name,
            currentMaker: componentMaker,
            nextName: mutationPlan.nextName,
            nextMaker: mutationPlan.nextMaker,
            componentIdentityId,
            selectedSource,
          });
          renamePublishedComponentIdentityFields({
            productRoot: storage?.productRoot || defaultProductRoot(),
            linkedProducts: linkedProductsBeforeRename,
            oldName: name,
            oldMaker: componentMaker,
            nextName: mutationPlan.nextName,
            nextMaker: mutationPlan.nextMaker,
          });
          await mirrorComponentIdentityOverride({
            config,
            category,
            componentType,
            oldName: name,
            oldMaker: componentMaker,
            nextName: mutationPlan.nextName,
            nextMaker: mutationPlan.nextMaker,
            source: selectedSource,
          });
          await cascadeComponentMutation({
            ...cascadeBase,
            componentType,
            componentName: mutationPlan.cascadeComponentName,
            componentMaker: mutationPlan.cascadeComponentMaker,
            changedProperty: mutationPlan.changedProperty,
            newValue: mutationPlan.selectedValue,
            variancePolicy: 'authoritative',
            constraints: [],
          });
        }
      }

      if (review_status) {
        if (respondMissingComponentIdentityId({
          respond,
          componentIdentityId,
          message: 'componentIdentityId is required for review_status updates.',
        })) {
          return true;
        }
        updateComponentReviewStatus({ runtimeSpecDb, componentIdentityId, reviewStatus: review_status });
      }

      specDbCache.delete(category);
      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: 'component-override',
        category,
        payload: { sql_only: true },
      });
    } catch (sqlErr) {
      return respond(500, {
        error: 'component_override_specdb_write_failed',
        message: sqlErr?.message || 'SpecDb write failed',
      });
    }

  }

  return false;
}

async function handleComponentKeyReviewConfirmEndpoint({
  parts,
  method,
  req,
  res,
  context,
}) {
  const {
    readJsonBody,
    jsonRes,
    getSpecDbReady,
    resolveComponentMutationContext,
    isMeaningfulValue,
    normalizeLower,
    buildComponentIdentifier,
    specDbCache,
    broadcastWs,
  } = context || {};
  const respond = createRouteResponder(jsonRes, res);

  // Component shared-lane confirm without overriding value (context-only decision)
  if (routeMatches({ parts, method, scope: 'review-components', action: 'component-key-review-confirm' })) {
    const preparedMutation = await prepareMutationContextRequest({
      parts,
      req,
      readJsonBody,
      getSpecDbReady,
      resolveContext: resolveComponentMutationContext,
      resolveContextArgs: buildComponentMutationContextArgs,
    });
    if (respondIfError(respond, preparedMutation.error)) {
      return true;
    }
    const {
      category,
      body,
      runtimeSpecDb,
      context: componentCtx,
    } = preparedMutation;
    const componentType = String(componentCtx?.componentType || '').trim();
    const name = String(componentCtx?.componentName || '').trim();
    const componentMaker = String(componentCtx?.componentMaker || '').trim();
    const property = String(componentCtx?.property || body?.property || '').trim();
    const componentIdentityId = componentCtx?.componentIdentityId ?? null;
    if (!componentType || !name || !property) {
      return respond(400, {
        error: 'component_context_required',
        message: 'component slot identifiers are required',
      });
    }

    try {
      let propertyRow = null;
      if (property !== '__name' && property !== '__maker') {
        propertyRow = componentCtx?.componentValueRow || null;
        if (!propertyRow?.id) {
          return respond(400, {
            error: 'component_value_id_required',
            message: 'componentValueId is required for component property mutations.',
          });
        }
      }

      const componentIdentifier = buildComponentIdentifier(componentType, name, componentMaker);
      const resolvedValue = String(
        (property === '__name' ? name : null)
        ?? (property === '__maker' ? componentMaker : null)
        ?? propertyRow?.value
        ?? ''
      ).trim();

      const requestedCandidateId = String(body?.candidateId || body?.candidate_id || '').trim() || null;
      if (!requestedCandidateId) {
        return respond(400, {
          error: 'candidate_id_required',
          message: 'candidateId is required for component AI confirm.',
        });
      }
      const stateValue = resolvedValue;
      if (!isMeaningfulValue(stateValue)) {
        return respond(400, {
          error: 'confirm_value_required',
          message: 'No resolved value to confirm for this component property',
        });
      }
      const componentSlotId = componentCtx?.componentValueId ?? propertyRow?.id ?? null;
      const pendingCandidateIds = [];
      const confirmStatusOverride = pendingCandidateIds.length > 0 ? 'pending' : 'confirmed';
      if (componentSlotId) {
        updateComponentValueNeedsReview({ runtimeSpecDb, componentSlotId, needsReview: confirmStatusOverride === 'pending' });
      }

      specDbCache.delete(category);
      return sendDataChangeResponse({
        jsonRes,
        res,
        broadcastWs,
        eventType: 'component-key-review-confirm',
        category,
        broadcastExtra: {
          componentType,
          name,
          property,
        },
        payload: {},
      });
    } catch (err) {
      return respond(500, {
        error: 'component_key_review_confirm_failed',
        message: err?.message || 'Component key review confirm failed',
      });
    }
  }

  return false;
}

export async function handleReviewComponentMutationRoute({
  parts,
  method,
  req,
  res,
  context,
}) {
  if (!Array.isArray(parts) || parts[0] !== 'review-components' || !parts[1]) {
    return false;
  }
  return runHandledRouteChain({
    handlers: [
      handleComponentTypeIdentitiesDeleteEndpoint,
      handleComponentIdentityDeleteEndpoint,
      handleComponentOverrideEndpoint,
      handleComponentKeyReviewConfirmEndpoint,
    ],
    args: { parts, method, req, res, context },
  });
}
