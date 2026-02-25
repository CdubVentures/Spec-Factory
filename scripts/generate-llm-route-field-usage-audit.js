import path from 'node:path';

import { writeLlmRouteFieldUsageAudit } from './llmRouteFieldUsageAudit.js';

const repoRoot = path.resolve('.');
const { outputFile, audit } = writeLlmRouteFieldUsageAudit({ repoRoot });

const dormantCount = Array.isArray(audit.dormantKeys) ? audit.dormantKeys.length : 0;
const dormantSummary = dormantCount > 0 ? audit.dormantKeys.join(', ') : 'none';

console.log(
  `[llm-route-field-usage-audit] wrote ${outputFile}; keys=${audit.keysCount}; dormant=${dormantCount} (${dormantSummary})`
);
