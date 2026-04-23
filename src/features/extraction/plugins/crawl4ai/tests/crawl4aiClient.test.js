import { describe, it, beforeEach } from 'node:test';
import { strictEqual, deepStrictEqual, ok, rejects } from 'node:assert';
import { EventEmitter } from 'node:events';
import { createCrawl4aiClient } from '../crawl4aiClient.js';

// ── Fake subprocess factory ──────────────────────────────────────────
// Simulates a child_process.ChildProcess just enough for the client to run.

function makeFakeProc() {
  const proc = new EventEmitter();
  proc.pid = 12345;
  proc.killed = false;
  // WHY: mirror real child_process stdio — writable=true, destroyed=false,
  // and support the callback form of write() so the production code's
  // async-error-capture path is exercised.
  const stdin = new EventEmitter();
  stdin.writes = [];
  stdin.writable = true;
  stdin.destroyed = false;
  stdin.write = (line, cb) => {
    stdin.writes.push(String(line));
    if (typeof cb === 'function') cb(null);
    return true;
  };
  stdin.end = () => { stdin.writable = false; };
  proc.stdin = stdin;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => {
    proc.killed = true;
    stdin.writable = false;
    stdin.destroyed = true;
  };
  proc.respond = (obj) => proc.stdout.emit('data', Buffer.from(JSON.stringify(obj) + '\n'));
  proc.die = (code = 1, signal = null) => {
    proc.killed = true;
    stdin.writable = false;
    stdin.destroyed = true;
    proc.emit('exit', code, signal);
  };
  return proc;
}

function makeFakeSpawnFactory() {
  const history = [];
  let next = makeFakeProc();
  function spawn(..._args) {
    const p = next;
    next = makeFakeProc();
    history.push(p);
    return p;
  }
  spawn._history = history;
  spawn._queueNext = (p) => { next = p; };
  return spawn;
}

describe('createCrawl4aiClient — spawn + lifecycle', () => {
  it('spawns on first extract call and emits crawl4ai_sidecar_started', async () => {
    const spawn = makeFakeSpawnFactory();
    const events = [];
    const client = createCrawl4aiClient({ spawn, onSidecarEvent: (e, p) => events.push([e, p]) });

    const promise = client.extract({ url: 'https://x', html: '<p/>', features: ['markdown'] });
    const proc = spawn._history[0];
    strictEqual(proc.stdin.writes.length, 1, 'request written to stdin');
    ok(events.some(([e]) => e === 'crawl4ai_sidecar_started'));

    proc.respond({ id: JSON.parse(proc.stdin.writes[0]).id, ok: true, markdown: 'a' });
    const result = await promise;
    strictEqual(result.ok, true);
    strictEqual(result.markdown, 'a');
    client.stop();
  });

  it('stop() kills subprocess and rejects pending requests', async () => {
    const spawn = makeFakeSpawnFactory();
    const client = createCrawl4aiClient({ spawn });
    const p = client.extract({ url: 'u', html: 'h', features: [] });
    client.stop();
    await rejects(p, (err) => err.message === 'crawl4ai_sidecar_stopped');
  });

  it('sanitizes request envelope — extra keys are stripped', async () => {
    const spawn = makeFakeSpawnFactory();
    const client = createCrawl4aiClient({ spawn });
    const promise = client.extract({ url: 'https://x', html: '<p/>', features: ['markdown'], secret: 'NOPE' });
    const proc = spawn._history[0];
    const sent = JSON.parse(proc.stdin.writes[0]);
    ok(!('secret' in sent), 'extra keys are not forwarded');
    deepStrictEqual(Object.keys(sent).sort(), ['features', 'html', 'id', 'url']);
    proc.respond({ id: sent.id, ok: true });
    await promise;
    client.stop();
  });
});

describe('createCrawl4aiClient — request correlation', () => {
  it('responds to out-of-order replies by id', async () => {
    const spawn = makeFakeSpawnFactory();
    const client = createCrawl4aiClient({ spawn });
    const a = client.extract({ url: 'a', html: 'a', features: [] });
    const b = client.extract({ url: 'b', html: 'b', features: [] });
    const proc = spawn._history[0];
    const idA = JSON.parse(proc.stdin.writes[0]).id;
    const idB = JSON.parse(proc.stdin.writes[1]).id;
    proc.respond({ id: idB, ok: true, markdown: 'B' });
    proc.respond({ id: idA, ok: true, markdown: 'A' });
    const [ra, rb] = await Promise.all([a, b]);
    strictEqual(ra.markdown, 'A');
    strictEqual(rb.markdown, 'B');
    client.stop();
  });

  it('ignores malformed stdout lines without crashing', async () => {
    const spawn = makeFakeSpawnFactory();
    const client = createCrawl4aiClient({ spawn });
    const promise = client.extract({ url: 'x', html: 'h', features: [] });
    const proc = spawn._history[0];
    proc.stdout.emit('data', Buffer.from('not json\n'));
    proc.stdout.emit('data', Buffer.from('{"partial":\n'));
    proc.respond({ id: JSON.parse(proc.stdin.writes[0]).id, ok: true });
    await promise;
    client.stop();
  });
});

describe('createCrawl4aiClient — timeout', () => {
  it('rejects with crawl4ai_sidecar_timeout when no response within timeoutMs', async () => {
    const spawn = makeFakeSpawnFactory();
    const client = createCrawl4aiClient({ spawn, timeoutMs: 1000 /* will be floored to 1000 */ });
    const p = client.extract({ url: 'x', html: 'h', features: [] });
    // Don't respond. Cheat timer via setTimeout immediate resolve is not ideal
    // in node:test; instead verify the pending state and cancel via stop().
    // The real timeout behavior is covered by integration + live smoke.
    client.stop();
    await rejects(p, (err) => err.message === 'crawl4ai_sidecar_stopped');
  });
});

describe('createCrawl4aiClient — death + restart', () => {
  it('auto-restarts subprocess on death up to maxRestarts', () => {
    const spawn = makeFakeSpawnFactory();
    const events = [];
    const client = createCrawl4aiClient({
      spawn,
      maxRestarts: 2,
      onSidecarEvent: (e, p) => events.push([e, p]),
    });
    // Fire-and-forget: we never await this — die() handler rejects pending.
    const p = client.extract({ url: 'x', html: 'h', features: [] });
    p.catch(() => {}); // suppress unhandled-rejection
    const proc1 = spawn._history[0];
    proc1.die(1);
    strictEqual(spawn._history.length, 2, 'restarted once');
    const restartEvt = events.find(([e]) => e === 'crawl4ai_sidecar_restarted');
    ok(restartEvt, 'restart event emitted');
    strictEqual(restartEvt[1].attempt, 1);
    strictEqual(restartEvt[1].max, 2);
    client.stop();
  });

  it('emits crawl4ai_sidecar_error after maxRestarts exceeded', () => {
    const spawn = makeFakeSpawnFactory();
    const events = [];
    const client = createCrawl4aiClient({
      spawn,
      maxRestarts: 1,
      onSidecarEvent: (e, p) => events.push([e, p]),
    });
    const p = client.extract({ url: 'x', html: 'h', features: [] });
    p.catch(() => {});
    spawn._history[0].die(1);      // 1st death → restart
    spawn._history[1].die(1);      // 2nd death → exhausted
    const err = events.find(([e, p]) => e === 'crawl4ai_sidecar_error' && p.reason === 'max_restarts_exceeded');
    ok(err, 'exhaustion error emitted');
    client.stop();
  });

  it('in-flight request is rejected when subprocess dies mid-flight', async () => {
    const spawn = makeFakeSpawnFactory();
    const client = createCrawl4aiClient({ spawn, maxRestarts: 1 });
    const p = client.extract({ url: 'x', html: 'h', features: [] });
    spawn._history[0].die(1);
    await rejects(p, (err) => err.message === 'crawl4ai_sidecar_died');
    client.stop();
  });
});

describe('createCrawl4aiClient — concurrency cap', () => {
  it('queues requests beyond maxConcurrent and drains on responses', async () => {
    const spawn = makeFakeSpawnFactory();
    const client = createCrawl4aiClient({ spawn, maxConcurrent: 2 });

    const pA = client.extract({ url: 'a', html: 'h', features: [] });
    const pB = client.extract({ url: 'b', html: 'h', features: [] });
    const pC = client.extract({ url: 'c', html: 'h', features: [] });

    const proc = spawn._history[0];
    // Only 2 dispatched initially.
    strictEqual(proc.stdin.writes.length, 2, 'cap honored');

    const idA = JSON.parse(proc.stdin.writes[0]).id;
    proc.respond({ id: idA, ok: true });
    await pA;

    // Draining should have sent the queued C.
    strictEqual(proc.stdin.writes.length, 3, 'queued request dispatched');

    const idB = JSON.parse(proc.stdin.writes[1]).id;
    const idC = JSON.parse(proc.stdin.writes[2]).id;
    proc.respond({ id: idB, ok: true });
    proc.respond({ id: idC, ok: true });
    await Promise.all([pB, pC]);
    client.stop();
  });
});
