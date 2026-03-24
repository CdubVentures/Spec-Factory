import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isHttpPreferredStaticSourceUrl,
  isLikelyIndexableEndpointUrl,
  isSafeManufacturerFollowupUrl
} from '../urlHelpers.js';

test('isLikelyIndexableEndpointUrl rejects REST service endpoints on API hosts', () => {
  assert.equal(
    isLikelyIndexableEndpointUrl(
      'https://api-p1.phoenix.razer.com/rest/v2/razerUs/products/productSKUPrefix?lang=en_US&curr=USD'
    ),
    false
  );
  assert.equal(
    isLikelyIndexableEndpointUrl(
      'https://api-p1.phoenix.razer.com/rest/v2/razerUs/users/anonymous/variant/products/Viper-V3-Pro-Base?lang=en_US&curr=USD'
    ),
    false
  );
  assert.equal(
    isLikelyIndexableEndpointUrl('https://www.razer.com/support/razer-viper-v3-pro'),
    true
  );
});

test('isSafeManufacturerFollowupUrl rejects sitemap pages for endpoint followups', () => {
  const source = { rootDomain: 'razer.com', host: 'razer.com' };

  assert.equal(
    isSafeManufacturerFollowupUrl(source, 'https://www.razer.com/support/razer-viper-v3-pro'),
    true
  );
  assert.equal(
    isSafeManufacturerFollowupUrl(source, 'https://www.razer.com/sitemap'),
    false
  );
});

test('isHttpPreferredStaticSourceUrl prefers manual-style pages without JS requirements', () => {
  assert.equal(
    isHttpPreferredStaticSourceUrl({
      url: 'https://www.manua.ls/logitech/g-pro-x-superlight-2-dex/manual',
      role: 'other',
      requires_js: false
    }),
    true
  );
  assert.equal(
    isHttpPreferredStaticSourceUrl({
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      role: 'manufacturer',
      requires_js: false
    }),
    false
  );
  assert.equal(
    isHttpPreferredStaticSourceUrl({
      url: 'https://downloads.vendor.example/manual.pdf',
      role: 'manufacturer',
      requires_js: true
    }),
    false
  );
});
