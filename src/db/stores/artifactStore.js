// WHY: Store module for crawl_sources, source_screenshots, source_pdfs, source_videos tables.
// Indexes raw binary artifacts (HTML, screenshots, PDFs) stored on disk.
// SQL rows point to content-addressed file paths — binaries never live in the DB.

export function createArtifactStore({ db, category, stmts }) {

  function insertCrawlSource(row) {
    stmts._insertCrawlSource.run({
      content_hash: row.content_hash || '',
      category: row.category || category,
      product_id: row.product_id || '',
      run_id: row.run_id || '',
      source_url: row.source_url || '',
      final_url: row.final_url || '',
      host: row.host || '',
      http_status: Number(row.http_status) || 0,
      doc_kind: row.doc_kind || 'other',
      source_tier: Number(row.source_tier) || 5,
      content_type: row.content_type || '',
      size_bytes: Number(row.size_bytes) || 0,
      file_path: row.file_path || '',
      has_screenshot: row.has_screenshot ? 1 : 0,
      has_pdf: row.has_pdf ? 1 : 0,
      has_ldjson: row.has_ldjson ? 1 : 0,
      has_dom_snippet: row.has_dom_snippet ? 1 : 0,
      crawled_at: row.crawled_at || new Date().toISOString(),
    });
  }

  function insertScreenshot(row) {
    stmts._insertScreenshot.run({
      screenshot_id: row.screenshot_id || '',
      content_hash: row.content_hash || '',
      category: row.category || category,
      product_id: row.product_id || '',
      run_id: row.run_id || '',
      source_url: row.source_url || '',
      host: row.host || '',
      selector: row.selector || 'fullpage',
      format: row.format || 'jpg',
      width: Number(row.width) || 0,
      height: Number(row.height) || 0,
      size_bytes: Number(row.size_bytes) || 0,
      file_path: row.file_path || '',
      captured_at: row.captured_at || new Date().toISOString(),
      doc_kind: row.doc_kind || 'other',
      source_tier: Number(row.source_tier) || 5,
    });
  }

  function insertPdf(row) {
    stmts._insertPdf.run({
      pdf_id: row.pdf_id || '',
      content_hash: row.content_hash || '',
      parent_content_hash: row.parent_content_hash || '',
      category: row.category || category,
      product_id: row.product_id || '',
      run_id: row.run_id || '',
      source_url: row.source_url || '',
      host: row.host || '',
      filename: row.filename || '',
      size_bytes: Number(row.size_bytes) || 0,
      file_path: row.file_path || '',
      pages_scanned: Number(row.pages_scanned) || 0,
      tables_found: Number(row.tables_found) || 0,
      pair_count: Number(row.pair_count) || 0,
      crawled_at: row.crawled_at || new Date().toISOString(),
    });
  }

  function getCrawlSourcesByProduct(productId) {
    return stmts._getCrawlSourcesByProduct.all(String(productId || ''));
  }

  function getScreenshotsByProduct(productId) {
    return stmts._getScreenshotsByProduct.all(String(productId || ''));
  }

  function insertVideo(row) {
    stmts._insertVideo.run({
      video_id: row.video_id || '',
      content_hash: row.content_hash || '',
      category: row.category || category,
      product_id: row.product_id || '',
      run_id: row.run_id || '',
      source_url: row.source_url || '',
      host: row.host || '',
      worker_id: row.worker_id || '',
      format: row.format || 'webm',
      width: Number(row.width) || 0,
      height: Number(row.height) || 0,
      size_bytes: Number(row.size_bytes) || 0,
      duration_ms: Number(row.duration_ms) || 0,
      file_path: row.file_path || '',
      captured_at: row.captured_at || new Date().toISOString(),
    });
  }

  function getVideosByProduct(productId) {
    return stmts._getVideosByProduct.all(String(productId || ''));
  }

  function getCrawlSourceByHash(contentHash, productId) {
    return stmts._getCrawlSourceByHash.get(
      String(contentHash || ''),
      String(productId || '')
    );
  }

  return {
    insertCrawlSource,
    insertScreenshot,
    insertPdf,
    insertVideo,
    getCrawlSourcesByProduct,
    getScreenshotsByProduct,
    getVideosByProduct,
    getCrawlSourceByHash,
  };
}
