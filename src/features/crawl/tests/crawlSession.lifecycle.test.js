import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCrawlSession } from '../crawlSession.js';
import {
  createCrawlerFactoryDouble,
  createPluginDouble,
} from './factories/crawlTestDoubles.js';

describe('createCrawlSession lifecycle', () => {
  it('reuses one crawler across multiple processUrl calls', async () => {
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('http://example.com/page1');
    await session.processUrl('http://example.com/page2');

    assert.equal(crawler.getCrawlerCount(), 1);
    assert.deepEqual(crawler.getProcessedUrls(), [
      'http://example.com/page1',
      'http://example.com/page2',
    ]);
  });

  it('runs plugin hooks in documented lifecycle order', async () => {
    const hookOrder = [];
    const plugin = createPluginDouble({
      name: 'tracker',
      hooks: {
        beforeNavigate: async () => { hookOrder.push('beforeNavigate'); },
        afterNavigate: async () => { hookOrder.push('afterNavigate'); },
        onInteract: async () => { hookOrder.push('onInteract'); },
        onCapture: async () => { hookOrder.push('onCapture'); },
        onComplete: async () => { hookOrder.push('onComplete'); },
      },
    });
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: {},
      plugins: [plugin],
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('http://example.com');

    assert.deepEqual(hookOrder, [
      'beforeNavigate',
      'afterNavigate',
      'onInteract',
      'onCapture',
      'onComplete',
    ]);
  });

  it('returns html, url, status, and screenshots through processUrl', async () => {
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('http://example.com');

    assert.equal(result.url, 'http://example.com');
    assert.equal(result.finalUrl, 'http://example.com');
    assert.equal(result.status, 200);
    assert.equal(typeof result.html, 'string');
    assert.ok(Array.isArray(result.screenshots));
  });

  it('resolves a failure payload when the crawler reports a navigation error', async () => {
    const crawler = createCrawlerFactoryDouble({
      resultByUrl: {
        'http://example.com': { error: new Error('navigation_failed') },
      },
    });
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    const result = await session.processUrl('http://example.com');

    assert.equal(result.status, 0);
    assert.equal(result.fetchError, 'navigation_failed');
    assert.equal(result.url, 'http://example.com');
  });

  it('tears down the crawler during shutdown', async () => {
    const crawler = createCrawlerFactoryDouble();
    const session = createCrawlSession({
      settings: {},
      plugins: [],
      _crawlerFactory: crawler.factory,
    });

    await session.processUrl('http://example.com');
    await session.shutdown();

    assert.equal(crawler.getTeardownCount(), 1);
  });

  it('exposes slotCount from settings', () => {
    const session = createCrawlSession({
      settings: { crawlSessionCount: 6 },
      plugins: [],
      _crawlerFactory: createCrawlerFactoryDouble().factory,
    });

    assert.equal(session.slotCount, 6);
  });
});
