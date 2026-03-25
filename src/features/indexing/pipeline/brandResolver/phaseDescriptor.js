// WHY: Orchestration descriptor for Brand Resolver phase.
// Runs IN PARALLEL with NeedSet via Promise.all.

import { runBrandResolver } from './runBrandResolver.js';
import { resolveBrandDomain } from './resolveBrandDomain.js';

export const brandResolverPhase = {
  id: 'brandResolver',
  phaseCursor: 'phase_02_brand_resolver',
  checkpoint: null,

  async execute(ctx) {
    const fn = ctx._di?.runBrandResolverFn || runBrandResolver;
    const result = await fn({
      job: ctx.job,
      category: ctx.category,
      config: ctx.config,
      storage: ctx.storage,
      logger: ctx.logger,
      categoryConfig: ctx.categoryConfig,
      resolveBrandDomainFn: ctx._di?.resolveBrandDomainFn || resolveBrandDomain,
    });
    return { brandResolution: result.brandResolution };
  },
};
