const http = require('http');
const runId = process.argv[2];
const url = `http://localhost:8788/api/v1/indexlab/run/${runId}/runtime/prefetch`;

http.get(url, (res) => {
  let body = '';
  res.on('data', (c) => body += c);
  res.on('end', () => {
    const d = JSON.parse(body);
    const n = d.needset || {};
    console.log('=== NEEDSET ===');
    console.log('schema_version:', n.schema_version);
    console.log('identity_state:', n.identity_state);
    console.log('fields:', (n.fields || []).length);
    console.log('bundles:', (n.bundles || []).length);
    if (n.profile_influence) {
      const pi = n.profile_influence;
      console.log('\n=== PROFILE INFLUENCE ===');
      const allKeys = Object.keys(pi).filter(k => typeof pi[k] === 'number');
      for (const k of allKeys) console.log(' ', k + ':', pi[k]);
    } else {
      console.log('profile_influence: NULL');
    }
    console.log('\n=== DELTAS ===');
    console.log('count:', (n.deltas || []).length);
    for (const d2 of (n.deltas || [])) console.log('  ', d2.field, d2.from, '->', d2.to);
    console.log('\n=== BUNDLES ===');
    for (const b of (n.bundles || [])) {
      console.log(b.key, '| phase:', b.phase, '| priority:', b.priority, '| queries:', (b.queries || []).length, '| fields:', (b.fields || []).length);
      for (const q of (b.queries || []).slice(0, 3)) console.log('    family:', q.family, '| q:', q.q);
    }
    console.log('\n=== OTHER TABS ===');
    console.log('brand_resolution:', d.brand_resolution ? d.brand_resolution.brand + ' (' + d.brand_resolution.status + ')' : 'NULL');
    console.log('search_plans:', (d.search_plans || []).length);
    console.log('search_results:', (d.search_results || []).length);
    console.log('serp_triage:', (d.serp_triage || []).length);
    console.log('domain_health:', (d.domain_health || []).length);
    console.log('llm_calls.brand_resolver:', (d.llm_calls?.brand_resolver || []).length);
    console.log('llm_calls.search_planner:', (d.llm_calls?.search_planner || []).length);
    console.log('llm_calls.serp_triage:', (d.llm_calls?.serp_triage || []).length);
  });
}).on('error', (e) => console.error('Failed:', e.message));
