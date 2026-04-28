import type { DataChangeMessage } from '../../../features/data-change/index.js';
import type { OperationUpsert, LlmCallRecord } from '../../../stores/operationsStore.ts';
import type { IndexLabEvent } from '../../../stores/indexlabStore.ts';
import type { ProcessStatus, RuntimeEvent } from '../../../types/events.ts';

export const MAX_LLM_STREAM_CHUNK_CHARS = 64_000;

interface OperationsWsMessage {
  readonly operation?: OperationUpsert;
  readonly removeId?: string;
  readonly appendCall?: {
    readonly id: string;
    readonly call: LlmCallRecord;
  };
  readonly updateCall?: {
    readonly id: string;
    readonly callIndex: number;
    readonly call: LlmCallRecord;
  };
}

export interface LlmStreamWsMessage {
  readonly operationId: string;
  readonly text: string;
  readonly callId?: string;
  readonly lane?: string;
  readonly label?: string;
  readonly channel?: string;
}

const OPERATION_STATUSES = new Set(['queued', 'running', 'done', 'error', 'cancelled']);
const LLM_CALL_RESPONSE_STATUSES = new Set(['pending', 'done']);
const INVALID_VALUE = Symbol('invalid');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readNonEmptyString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : '';
}

function optionalString(record: Record<string, unknown>, key: string): boolean {
  return !hasOwn(record, key) || record[key] === undefined || typeof record[key] === 'string';
}

function optionalNullableString(record: Record<string, unknown>, key: string): boolean {
  return !hasOwn(record, key)
    || record[key] === undefined
    || record[key] === null
    || typeof record[key] === 'string';
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean {
  return !hasOwn(record, key) || record[key] === undefined || typeof record[key] === 'boolean';
}

function optionalFiniteNumber(record: Record<string, unknown>, key: string): boolean {
  return !hasOwn(record, key) || record[key] === undefined || Number.isFinite(record[key]);
}

function optionalNullableFiniteNumber(record: Record<string, unknown>, key: string): boolean {
  return !hasOwn(record, key)
    || record[key] === undefined
    || record[key] === null
    || Number.isFinite(record[key]);
}

function readOptionalNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined | typeof INVALID_VALUE {
  if (!hasOwn(record, key) || record[key] === undefined) return undefined;
  if (record[key] === null) return null;
  return typeof record[key] === 'string' ? record[key] : INVALID_VALUE;
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}

function resolveNullableStringAliases(
  record: Record<string, unknown>,
  firstKey: string,
  secondKey: string,
): string | null | typeof INVALID_VALUE {
  const first = readOptionalNullableString(record, firstKey);
  const second = readOptionalNullableString(record, secondKey);
  if (first === INVALID_VALUE || second === INVALID_VALUE) return INVALID_VALUE;
  const firstValue = normalizeNullableString(first);
  const secondValue = normalizeNullableString(second);
  if (firstValue && secondValue && firstValue !== secondValue) return INVALID_VALUE;
  return firstValue || secondValue || null;
}

function readOptionalNullableFiniteNumber(
  record: Record<string, unknown>,
  key: string,
): number | null | undefined | typeof INVALID_VALUE {
  if (!hasOwn(record, key) || record[key] === undefined) return undefined;
  if (record[key] === null) return null;
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : INVALID_VALUE;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function optionalStringArray(record: Record<string, unknown>, key: string): boolean {
  return !hasOwn(record, key) || record[key] === undefined || isStringArray(record[key]);
}

function isNullableRecord(value: unknown): boolean {
  return value === null || value === undefined || isRecord(value);
}

function isModelInfo(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return typeof value.model === 'string'
    && typeof value.provider === 'string'
    && typeof value.isFallback === 'boolean'
    && typeof value.accessMode === 'string'
    && typeof value.thinking === 'boolean'
    && typeof value.webSearch === 'boolean'
    && typeof value.effortLevel === 'string';
}

function isUsage(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (!isRecord(value)) return false;
  return Number.isFinite(value.prompt_tokens)
    && Number.isFinite(value.completion_tokens)
    && Number.isFinite(value.total_tokens)
    && Number.isFinite(value.cost_usd)
    && optionalBoolean(value, 'estimated_usage');
}

function isPrompt(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.system === 'string' && typeof value.user === 'string';
}

function isLlmCallSummary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.callIndex)
    && typeof value.timestamp === 'string'
    && typeof value.responseStatus === 'string'
    && LLM_CALL_RESPONSE_STATUSES.has(value.responseStatus)
    && optionalString(value, 'callId')
    && optionalString(value, 'model')
    && optionalString(value, 'variant')
    && optionalString(value, 'mode')
    && optionalString(value, 'lane')
    && optionalString(value, 'label')
    && optionalBoolean(value, 'isFallback')
    && optionalBoolean(value, 'thinking')
    && optionalBoolean(value, 'webSearch')
    && optionalString(value, 'effortLevel')
    && optionalString(value, 'accessMode')
    && (!hasOwn(value, 'usage') || isUsage(value.usage));
}

function isFullLlmCallRecord(value: unknown): value is LlmCallRecord {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.callIndex)
    && Number.isFinite(value.callIndex)
    && typeof value.timestamp === 'string'
    && isPrompt(value.prompt)
    && optionalString(value, 'callId')
    && optionalString(value, 'model')
    && optionalString(value, 'variant')
    && optionalString(value, 'mode')
    && optionalString(value, 'lane')
    && optionalString(value, 'label')
    && optionalBoolean(value, 'isFallback')
    && optionalBoolean(value, 'thinking')
    && optionalBoolean(value, 'webSearch')
    && optionalString(value, 'effortLevel')
    && optionalString(value, 'accessMode')
    && (!hasOwn(value, 'usage') || isUsage(value.usage));
}

function isIndexLabLinkIdentity(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  return typeof value.productId === 'string'
    && typeof value.brand === 'string'
    && typeof value.baseModel === 'string';
}

function isOperationUpsert(value: unknown): value is OperationUpsert {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || !value.id.trim()) return false;
  if (typeof value.type !== 'string') return false;
  if (typeof value.category !== 'string') return false;
  if (typeof value.productId !== 'string') return false;
  if (typeof value.productLabel !== 'string') return false;
  if (!isStringArray(value.stages)) return false;
  const currentStageIndex = value.currentStageIndex;
  if (typeof currentStageIndex !== 'number') return false;
  if (!Number.isInteger(currentStageIndex) || !Number.isFinite(currentStageIndex)) return false;
  if (currentStageIndex < 0) return false;
  if (value.stages.length > 0 && currentStageIndex >= value.stages.length) return false;
  if (typeof value.status !== 'string' || !OPERATION_STATUSES.has(value.status)) return false;
  if (typeof value.startedAt !== 'string') return false;
  if (!optionalNullableString(value, 'endedAt')) return false;
  if (!optionalNullableString(value, 'error')) return false;
  if (!hasOwn(value, 'modelInfo') || !isModelInfo(value.modelInfo)) return false;
  if (hasOwn(value, 'llmCalls') && value.llmCalls !== undefined) {
    if (!Array.isArray(value.llmCalls) || !value.llmCalls.every(isFullLlmCallRecord)) return false;
  }
  if (hasOwn(value, 'activeLlmCalls') && value.activeLlmCalls !== undefined) {
    if (!Array.isArray(value.activeLlmCalls) || !value.activeLlmCalls.every(isLlmCallSummary)) return false;
  }
  return isIndexLabLinkIdentity(value.indexLabLinkIdentity)
    && optionalString(value, 'subType')
    && optionalString(value, 'variantKey')
    && optionalString(value, 'variantId')
    && optionalString(value, 'fieldKey')
    && optionalString(value, 'progressText')
    && optionalString(value, 'queuedAt')
    && optionalFiniteNumber(value, 'queueDelayMs')
    && optionalBoolean(value, 'passengersRegistered')
    && optionalStringArray(value, 'passengerFieldKeys')
    && optionalFiniteNumber(value, 'llmCallCount')
    && optionalFiniteNumber(value, 'activeLlmCallCount')
    && (!hasOwn(value, 'loopProgress') || isNullableRecord(value.loopProgress));
}

export function resolveOperationsWsMessage(value: unknown): OperationsWsMessage | null {
  if (!isRecord(value)) return null;

  const action = typeof value.action === 'string' ? value.action : '';
  if (action === 'remove') {
    const removeId = readNonEmptyString(value.id);
    return removeId ? { removeId } : null;
  }

  const operation = hasOwn(value, 'operation') && value.operation !== undefined
    ? (isOperationUpsert(value.operation) ? value.operation : null)
    : undefined;
  if (operation === null) return null;

  const id = readNonEmptyString(value.id);
  const resolved: {
    operation?: OperationUpsert;
    appendCall?: OperationsWsMessage['appendCall'];
    updateCall?: OperationsWsMessage['updateCall'];
  } = {};
  if (operation) resolved.operation = operation;

  if (action === 'llm-call-append' && id && isFullLlmCallRecord(value.call)) {
    resolved.appendCall = { id, call: value.call };
  }

  if (action === 'llm-call-update' && id && isFullLlmCallRecord(value.call)) {
    resolved.updateCall = { id, callIndex: value.call.callIndex, call: value.call };
  }

  return Object.keys(resolved).length > 0 ? resolved : null;
}

export function resolveProcessStatusWsMessage(value: unknown): ProcessStatus | null {
  if (!isRecord(value)) return null;
  if (typeof value.running !== 'boolean') return null;

  const runId = resolveNullableStringAliases(value, 'run_id', 'runId');
  const productId = resolveNullableStringAliases(value, 'product_id', 'productId');
  const storageDestination = resolveNullableStringAliases(value, 'storage_destination', 'storageDestination');
  if (runId === INVALID_VALUE || productId === INVALID_VALUE || storageDestination === INVALID_VALUE) return null;
  if (storageDestination !== null && storageDestination !== 'local') return null;

  const category = readOptionalNullableString(value, 'category');
  const brand = readOptionalNullableString(value, 'brand');
  const baseModel = readOptionalNullableString(value, 'base_model');
  const model = readOptionalNullableString(value, 'model');
  const variant = readOptionalNullableString(value, 'variant');
  const command = readOptionalNullableString(value, 'command');
  const startedAt = readOptionalNullableString(value, 'startedAt');
  const endedAt = readOptionalNullableString(value, 'endedAt');
  if (
    category === INVALID_VALUE
    || brand === INVALID_VALUE
    || baseModel === INVALID_VALUE
    || model === INVALID_VALUE
    || variant === INVALID_VALUE
    || command === INVALID_VALUE
    || startedAt === INVALID_VALUE
    || endedAt === INVALID_VALUE
  ) {
    return null;
  }

  const pid = readOptionalNullableFiniteNumber(value, 'pid');
  const exitCode = readOptionalNullableFiniteNumber(value, 'exitCode');
  if (pid === INVALID_VALUE || exitCode === INVALID_VALUE) return null;

  return {
    running: value.running,
    run_id: runId,
    runId,
    category: normalizeNullableString(category),
    product_id: productId,
    productId,
    brand: normalizeNullableString(brand),
    base_model: normalizeNullableString(baseModel),
    model: normalizeNullableString(model),
    variant: normalizeNullableString(variant),
    storage_destination: 'local',
    storageDestination: 'local',
    pid: pid ?? null,
    command: normalizeNullableString(command),
    startedAt: normalizeNullableString(startedAt),
    exitCode: exitCode ?? null,
    endedAt: normalizeNullableString(endedAt),
  };
}

export function isProcessStatusWsMessage(value: unknown): value is ProcessStatus {
  return resolveProcessStatusWsMessage(value) !== null;
}

export function isRuntimeEventList(value: unknown): value is RuntimeEvent[] {
  return Array.isArray(value)
    && value.every((entry) => isRecord(entry)
      && typeof entry.ts === 'string'
      && typeof entry.event === 'string');
}

export function isProcessOutputList(value: unknown): value is string[] {
  return isStringArray(value);
}

export function isIndexLabEventList(value: unknown): value is IndexLabEvent[] {
  return Array.isArray(value)
    && value.every((entry) => isRecord(entry)
      && typeof entry.run_id === 'string'
      && typeof entry.ts === 'string'
      && typeof entry.stage === 'string'
      && typeof entry.event === 'string'
      && (!hasOwn(entry, 'payload') || isNullableRecord(entry.payload)));
}

function dataChangeEventName(value: Record<string, unknown>): string {
  const event = readNonEmptyString(value.event);
  if (event) return event;
  const type = readNonEmptyString(value.type);
  return type && type !== 'data-change' ? type : '';
}

function isDataChangeEntities(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!isRecord(value)) return false;
  return optionalStringArray(value, 'productIds') && optionalStringArray(value, 'fieldKeys');
}

export function isDataChangeWsMessage(value: unknown): value is DataChangeMessage {
  if (!isRecord(value)) return false;
  if (!dataChangeEventName(value)) return false;
  return optionalString(value, 'type')
    && optionalString(value, 'event')
    && optionalString(value, 'category')
    && optionalStringArray(value, 'categories')
    && optionalStringArray(value, 'domains')
    && isDataChangeEntities(value.entities)
    && isNullableRecord(value.version)
    && isNullableRecord(value.meta);
}

function optionalStreamText(record: Record<string, unknown>, key: string): string | null {
  if (!hasOwn(record, key) || record[key] === undefined) return '';
  return typeof record[key] === 'string' ? record[key] : null;
}

export function resolveLlmStreamWsMessage(value: unknown): LlmStreamWsMessage | null {
  if (!isRecord(value)) return null;
  const operationId = readNonEmptyString(value.operationId);
  const text = typeof value.text === 'string' ? value.text : '';
  if (!operationId || !text || text.length > MAX_LLM_STREAM_CHUNK_CHARS) return null;

  const callId = optionalStreamText(value, 'callId');
  const lane = optionalStreamText(value, 'lane');
  const label = optionalStreamText(value, 'label');
  const channel = optionalStreamText(value, 'channel');
  if (callId === null || lane === null || label === null || channel === null) return null;

  return {
    operationId,
    text,
    ...(callId ? { callId } : {}),
    ...(lane ? { lane } : {}),
    ...(label ? { label } : {}),
    ...(channel ? { channel } : {}),
  };
}
