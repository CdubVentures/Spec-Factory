import { emitDataChange } from '../../../../core/events/dataChangeContract.js';

function filterCategoryDirs(categoryDirs = [], includeTest = false) {
  return categoryDirs.filter((category) => {
    if (category === '_global') return false;
    if (category.startsWith('_test_')) return includeTest;
    return !category.startsWith('_');
  });
}

export function createInfraCategoryRoutes({
  jsonRes,
  readJsonBody,
  listDirs,
  canonicalSlugify,
  HELPER_ROOT,
  fs,
  pathApi,
  broadcastWs,
  emitDataChangeFn = emitDataChange,
  scaffoldCategoryFn = null,
} = {}) {
  return async function handleInfraCategories(parts, params, method, req, res) {
    if (parts[0] !== 'categories') {
      return false;
    }

    if (method === 'GET') {
      const includeTest = params.get('includeTest') === 'true';
      const categories = filterCategoryDirs(await listDirs(HELPER_ROOT), includeTest);
      return jsonRes(res, 200, categories.length > 0 ? categories : ['mouse']);
    }

    if (method !== 'POST') {
      return false;
    }

    const body = await readJsonBody(req);
    const slug = canonicalSlugify(body?.name);
    if (!slug) {
      return jsonRes(res, 400, { ok: false, error: 'category_name_required' });
    }

    const categoryDir = pathApi.join(HELPER_ROOT, slug);
    try {
      await fs.access(categoryDir);
      return jsonRes(res, 409, { ok: false, error: 'category_already_exists', slug });
    } catch {
      // category does not exist yet
    }

    let fieldCount = 0;
    if (scaffoldCategoryFn) {
      const result = await scaffoldCategoryFn({
        category: slug,
        config: { categoryAuthorityRoot: HELPER_ROOT },
      });
      if (!result.compileResult?.compiled) {
        return jsonRes(res, 500, {
          ok: false,
          error: 'scaffold_compile_failed',
          details: result.compileResult?.errors || [],
        });
      }
      fieldCount = result.compileResult.field_count || 0;
    } else {
      await fs.mkdir(categoryDir, { recursive: true });
      await fs.mkdir(pathApi.join(categoryDir, '_control_plane'), { recursive: true });
      await fs.mkdir(pathApi.join(categoryDir, '_generated'), { recursive: true });
    }

    const categories = filterCategoryDirs(await listDirs(HELPER_ROOT));
    emitDataChangeFn({
      broadcastWs,
      event: 'category-created',
      category: 'all',
      meta: { slug },
    });

    return jsonRes(res, 201, { ok: true, slug, categories, ...(fieldCount > 0 ? { field_count: fieldCount } : {}) });
  };
}
