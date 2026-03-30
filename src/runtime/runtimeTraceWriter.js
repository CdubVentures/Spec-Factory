import fs from 'node:fs/promises';
import path from 'node:path';
import { toInt } from '../shared/valueNormalizers.js';

function sanitizePathToken(value, fallback = 'trace') {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return token || fallback;
}

function sanitizeFilename(value, fallback = 'events.jsonl') {
  const token = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return token || fallback;
}

export class RuntimeTraceWriter {
  constructor({
    runDir,
    runId,
    productId,
  } = {}) {
    this.runDir = String(runDir || '');
    this.runId = sanitizePathToken(runId, 'run');
    this.productId = sanitizePathToken(productId, 'product');
    this.counters = new Map();
  }

  nextRingSlot(counterKey, ringSize) {
    const size = Math.max(1, toInt(ringSize, 1));
    const prev = toInt(this.counters.get(counterKey), 0);
    const next = prev + 1;
    this.counters.set(counterKey, next);
    return (next - 1) % size;
  }

  async writeJson({
    section,
    prefix,
    payload,
    ringSize = 0
  } = {}) {
    const sectionToken = sanitizePathToken(section, 'misc');
    const prefixToken = sanitizePathToken(prefix, 'trace');
    const slot = ringSize > 0
      ? this.nextRingSlot(`${sectionToken}:${prefixToken}`, ringSize)
      : this.nextRingSlot(`${sectionToken}:${prefixToken}`, Number.MAX_SAFE_INTEGER);
    const suffix = String(slot).padStart(3, '0');
    const filename = `${prefixToken}_${suffix}.json`;
    const tracePath = path.join(this.runDir, 'traces', sectionToken, filename);
    await fs.mkdir(path.dirname(tracePath), { recursive: true });
    await fs.writeFile(tracePath, `${JSON.stringify(payload ?? {}, null, 2)}\n`, 'utf8');
    return { trace_path: tracePath };
  }

  async appendJsonl({
    section,
    filename,
    row
  } = {}) {
    const sectionToken = sanitizePathToken(section, 'misc');
    const fileToken = sanitizeFilename(filename, 'events.jsonl');
    const finalName = fileToken.endsWith('.jsonl') ? fileToken : `${fileToken}.jsonl`;
    const tracePath = path.join(this.runDir, 'traces', sectionToken, finalName);
    await fs.mkdir(path.dirname(tracePath), { recursive: true });
    await fs.appendFile(tracePath, `${JSON.stringify(row ?? {})}\n`, 'utf8');
    return { trace_path: tracePath };
  }

  async writeText({
    section,
    prefix,
    text = '',
    extension = 'txt',
    ringSize = 0,
  } = {}) {
    const sectionToken = sanitizePathToken(section, 'misc');
    const prefixToken = sanitizePathToken(prefix, 'trace');
    const ext = sanitizePathToken(extension, 'txt');
    const slot = ringSize > 0
      ? this.nextRingSlot(`${sectionToken}:${prefixToken}:${ext}`, ringSize)
      : this.nextRingSlot(`${sectionToken}:${prefixToken}:${ext}`, Number.MAX_SAFE_INTEGER);
    const suffix = String(slot).padStart(3, '0');
    const filename = `${prefixToken}_${suffix}.${ext}`;
    const tracePath = path.join(this.runDir, 'traces', sectionToken, filename);
    await fs.mkdir(path.dirname(tracePath), { recursive: true });
    await fs.writeFile(tracePath, String(text || ''), 'utf8');
    return { trace_path: tracePath };
  }
}
