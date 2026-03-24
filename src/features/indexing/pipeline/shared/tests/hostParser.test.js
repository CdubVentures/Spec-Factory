import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHost,
  normalizeHost,
  isSubdomainOf,
  hostMatchesDomain,
  isValidDomain
} from '../hostParser.js';

describe('hostParser', () => {
  describe('parseHost', () => {
    it('parses standard domain', () => {
      const r = parseHost('razer.com');
      assert.equal(r.host, 'razer.com');
      assert.equal(r.registrableDomain, 'razer.com');
      assert.equal(r.subdomain, '');
      assert.equal(r.publicSuffix, 'com');
      assert.equal(r.isIp, false);
    });

    it('strips www prefix', () => {
      const r = parseHost('www.razer.com');
      assert.equal(r.host, 'razer.com');
      assert.equal(r.registrableDomain, 'razer.com');
      assert.equal(r.subdomain, '');
    });

    it('parses subdomain', () => {
      const r = parseHost('docs.razer.com');
      assert.equal(r.host, 'docs.razer.com');
      assert.equal(r.registrableDomain, 'razer.com');
      assert.equal(r.subdomain, 'docs');
    });

    it('parses full URL with protocol, path, query, fragment', () => {
      const r = parseHost('https://docs.razer.com/mice?q=1#specs');
      assert.equal(r.host, 'docs.razer.com');
      assert.equal(r.registrableDomain, 'razer.com');
      assert.equal(r.subdomain, 'docs');
    });

    it('strips port from host', () => {
      const r = parseHost('razer.com:8080');
      assert.equal(r.host, 'razer.com');
      assert.equal(r.registrableDomain, 'razer.com');
    });

    it('handles full URL with port', () => {
      const r = parseHost('http://razer.com:3000/path');
      assert.equal(r.host, 'razer.com');
      assert.equal(r.registrableDomain, 'razer.com');
    });

    it('parses multi-part TLD co.uk', () => {
      const r = parseHost('bbc.co.uk');
      assert.equal(r.host, 'bbc.co.uk');
      assert.equal(r.registrableDomain, 'bbc.co.uk');
      assert.equal(r.publicSuffix, 'co.uk');
      assert.equal(r.subdomain, '');
    });

    it('parses subdomain of multi-part TLD', () => {
      const r = parseHost('shop.bbc.co.uk');
      assert.equal(r.host, 'shop.bbc.co.uk');
      assert.equal(r.registrableDomain, 'bbc.co.uk');
      assert.equal(r.subdomain, 'shop');
      assert.equal(r.publicSuffix, 'co.uk');
    });

    it('parses com.au multi-part TLD', () => {
      const r = parseHost('example.com.au');
      assert.equal(r.registrableDomain, 'example.com.au');
      assert.equal(r.publicSuffix, 'com.au');
    });

    it('detects IPv4', () => {
      const r = parseHost('192.168.1.1');
      assert.equal(r.isIp, true);
      assert.equal(r.host, '192.168.1.1');
      assert.equal(r.registrableDomain, '');
    });

    it('detects IPv6', () => {
      const r = parseHost('[::1]');
      assert.equal(r.isIp, true);
      assert.equal(r.host, '::1');
    });

    it('detects IPv6 from URL', () => {
      const r = parseHost('http://[::1]:8080/path');
      assert.equal(r.isIp, true);
    });

    it('rejects bogus token v2.0', () => {
      const r = parseHost('v2.0');
      assert.equal(r.host, '');
      assert.equal(r.registrableDomain, '');
    });

    it('rejects numeric-only 1.2.3', () => {
      const r = parseHost('1.2.3');
      assert.equal(r.host, '');
      assert.equal(r.registrableDomain, '');
    });

    it('rejects single word', () => {
      const r = parseHost('hello');
      assert.equal(r.host, '');
      assert.equal(r.registrableDomain, '');
    });

    it('rejects dots only', () => {
      const r = parseHost('...');
      assert.equal(r.host, '');
      assert.equal(r.registrableDomain, '');
    });

    it('returns empty for null/undefined/empty', () => {
      for (const input of [null, undefined, '', '   ']) {
        const r = parseHost(input);
        assert.equal(r.host, '', `expected empty host for ${JSON.stringify(input)}`);
        assert.equal(r.registrableDomain, '');
        assert.equal(r.isIp, false);
      }
    });

    it('normalizes punycode to unicode', () => {
      const r = parseHost('xn--n3h.example.com');
      assert.equal(r.registrableDomain, 'example.com');
      // subdomain should be decoded
      assert.ok(r.subdomain.length > 0);
    });

    it('lowercases', () => {
      const r = parseHost('DOCS.Razer.COM');
      assert.equal(r.host, 'docs.razer.com');
      assert.equal(r.registrableDomain, 'razer.com');
    });
  });

  describe('normalizeHost', () => {
    it('lowercases and strips www', () => {
      assert.equal(normalizeHost('WWW.Razer.COM'), 'razer.com');
    });

    it('strips protocol and path', () => {
      assert.equal(normalizeHost('https://www.razer.com/mice'), 'razer.com');
    });

    it('strips port', () => {
      assert.equal(normalizeHost('razer.com:8080'), 'razer.com');
    });

    it('returns empty for null', () => {
      assert.equal(normalizeHost(null), '');
    });
  });

  describe('isSubdomainOf', () => {
    it('returns true for subdomain', () => {
      assert.equal(isSubdomainOf('docs.razer.com', 'razer.com'), true);
    });

    it('returns false for exact match', () => {
      assert.equal(isSubdomainOf('razer.com', 'razer.com'), false);
    });

    it('returns false for unrelated', () => {
      assert.equal(isSubdomainOf('evilrazer.com', 'razer.com'), false);
    });

    it('returns false for evil prefix', () => {
      assert.equal(isSubdomainOf('notarazer.com', 'razer.com'), false);
    });
  });

  describe('hostMatchesDomain', () => {
    it('matches exact', () => {
      assert.equal(hostMatchesDomain('razer.com', 'razer.com'), true);
    });

    it('matches subdomain', () => {
      assert.equal(hostMatchesDomain('docs.razer.com', 'razer.com'), true);
    });

    it('rejects unrelated', () => {
      assert.equal(hostMatchesDomain('logitech.com', 'razer.com'), false);
    });

    it('rejects evil prefix', () => {
      assert.equal(hostMatchesDomain('evilrazer.com', 'razer.com'), false);
    });
  });

  describe('isValidDomain', () => {
    it('accepts razer.com', () => {
      assert.equal(isValidDomain('razer.com'), true);
    });

    it('accepts docs.razer.com', () => {
      assert.equal(isValidDomain('docs.razer.com'), true);
    });

    it('accepts multi-part TLD', () => {
      assert.equal(isValidDomain('bbc.co.uk'), true);
    });

    it('rejects v2.0', () => {
      assert.equal(isValidDomain('v2.0'), false);
    });

    it('rejects bare word', () => {
      assert.equal(isValidDomain('hello'), false);
    });

    it('rejects IP', () => {
      assert.equal(isValidDomain('192.168.1.1'), false);
    });

    it('rejects empty', () => {
      assert.equal(isValidDomain(''), false);
    });
  });
});
