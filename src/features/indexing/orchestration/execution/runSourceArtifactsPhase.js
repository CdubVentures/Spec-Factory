import { gzipBuffer, toNdjson } from '../../../../utils/common.js';

function defaultJsonBuffer(value) {
  return Buffer.from(JSON.stringify(value ?? null, null, 2), 'utf8');
}

export async function runSourceArtifactsPhase({
  source = {},
  pageData = {},
  sourceStatusCode = 0,
  fetchDurationMs = 0,
  fetchContentType = '',
  sourceFetchOutcome = '',
  artifactSequence = 0,
  runArtifactsBase = '',
  config = {},
  storage = null,
  logger = null,
  traceWriter = null,
  buildDomSnippetArtifactFn = () => null,
  toIntFn = (value, fallback = 0) => Number(value || fallback),
  screenshotExtensionFn = (format) => String(format || 'jpeg'),
  screenshotMimeTypeFn = (format) => `image/${String(format || 'jpeg')}`,
  sha256Fn = (value = '') => String(value || ''),
  sha256BufferFn = () => '',
  nowIsoFn = () => new Date().toISOString(),
  gzipBufferFn = gzipBuffer,
  toNdjsonFn = toNdjson,
  jsonBufferFn = defaultJsonBuffer,
} = {}) {
  const domSnippetArtifact = buildDomSnippetArtifactFn(
    pageData.html,
    Math.max(600, toIntFn(config.domSnippetMaxChars, 3_600))
  );
  const artifactHostKey = `${source.host}__${String(artifactSequence).padStart(4, '0')}`;
  const nextArtifactSequence = artifactSequence + 1;
  const pageHtmlUri = `${runArtifactsBase}/raw/pages/${artifactHostKey}/page.html.gz`;
  const ldjsonUri = `${runArtifactsBase}/raw/pages/${artifactHostKey}/ldjson.json`;
  const embeddedStateUri = `${runArtifactsBase}/raw/pages/${artifactHostKey}/embedded_state.json`;
  const networkResponsesUri = `${runArtifactsBase}/raw/network/${artifactHostKey}/responses.ndjson.gz`;
  let pageArtifactsPersisted = true;

  const rawPageArtifacts = [
    {
      kind: 'page_html',
      uri: pageHtmlUri,
      serialize: () => gzipBufferFn(pageData.html || ''),
      options: {
        contentType: 'text/html',
        contentEncoding: 'gzip'
      }
    },
    {
      kind: 'ldjson',
      uri: ldjsonUri,
      serialize: () => jsonBufferFn(pageData.ldjsonBlocks || []),
      options: {
        contentType: 'application/json'
      }
    },
    {
      kind: 'embedded_state',
      uri: embeddedStateUri,
      serialize: () => jsonBufferFn(pageData.embeddedState || {}),
      options: {
        contentType: 'application/json'
      }
    },
    {
      kind: 'network_responses',
      uri: networkResponsesUri,
      serialize: () => gzipBufferFn(toNdjsonFn(pageData.networkResponses || [])),
      options: {
        contentType: 'application/x-ndjson',
        contentEncoding: 'gzip'
      }
    }
  ];

  const domSnippetUri = domSnippetArtifact
    ? `${runArtifactsBase}/raw/dom/${artifactHostKey}/dom_snippet.html`
    : '';
  if (domSnippetArtifact && domSnippetUri) {
    domSnippetArtifact.uri = domSnippetUri;
    domSnippetArtifact.content_hash = `sha256:${sha256Fn(domSnippetArtifact.html || '')}`;
  }

  const screenshotArtifact = pageData?.screenshot && typeof pageData.screenshot === 'object'
    ? pageData.screenshot
    : null;
  const screenshotBytes = Buffer.isBuffer(screenshotArtifact?.bytes)
    ? screenshotArtifact.bytes
    : null;
  const screenshotFormat = String(screenshotArtifact?.format || 'jpeg').trim().toLowerCase() === 'png'
    ? 'png'
    : 'jpeg';
  const screenshotUri = screenshotArtifact
    ? `${runArtifactsBase}/raw/screenshots/${artifactHostKey}/screenshot.${screenshotExtensionFn(screenshotFormat)}`
    : '';
  const screenshotFileUri = screenshotArtifact && screenshotUri && typeof storage?.resolveLocalPath === 'function'
    ? storage.resolveLocalPath(screenshotUri)
    : screenshotUri;
  if (screenshotArtifact && screenshotUri) {
    screenshotArtifact.uri = screenshotUri;
    screenshotArtifact.file_uri = screenshotFileUri;
    screenshotArtifact.mime_type = screenshotMimeTypeFn(screenshotFormat);
    screenshotArtifact.content_hash = screenshotArtifact.content_hash || sha256BufferFn(screenshotBytes);
  }

  for (const artifact of rawPageArtifacts) {
    try {
      const artifactValue = artifact.serialize();
      await storage?.writeObject?.(artifact.uri, artifactValue, artifact.options);
    } catch (error) {
      pageArtifactsPersisted = false;
      logger?.warn?.('page_artifact_persist_failed', {
        url: source.url,
        uri: artifact.uri,
        kind: artifact.kind,
        message: error?.message || 'write_failed'
      });
    }
  }

  if (domSnippetArtifact && domSnippetUri) {
    try {
      await storage?.writeObject?.(
        domSnippetUri,
        domSnippetArtifact.html || '',
        { contentType: 'text/html; charset=utf-8' }
      );
    } catch (error) {
      logger?.warn?.('dom_snippet_persist_failed', {
        url: source.url,
        uri: domSnippetUri,
        message: error?.message || 'write_failed'
      });
    }
  }

  if (screenshotArtifact && screenshotUri && Buffer.isBuffer(screenshotBytes)) {
    let screenshotPersisted = false;
    try {
      await storage?.writeObject?.(
        screenshotUri,
        screenshotBytes,
        { contentType: screenshotMimeTypeFn(screenshotFormat) }
      );
      screenshotPersisted = true;
    } catch (error) {
      logger?.warn?.('screenshot_persist_failed', {
        url: source.url,
        uri: screenshotUri,
        message: error?.message || 'write_failed'
      });
    }
    if (screenshotPersisted) {
      screenshotArtifact.bytes = screenshotBytes.length;
    }
  }

  if (screenshotArtifact && screenshotUri) {
    logger?.info?.('visual_asset_captured', {
      url: source.url,
      screenshot_uri: screenshotUri,
      width: Number(screenshotArtifact.width || 0),
      height: Number(screenshotArtifact.height || 0),
      format: screenshotFormat,
      bytes: Buffer.isBuffer(screenshotBytes) ? screenshotBytes.length : 0,
      capture_ms: 0,
      quality_score: 0,
    });
  }

  if (traceWriter) {
    const fetchTrace = await traceWriter.writeJson({
      section: 'fetch',
      prefix: 'fetch',
      payload: {
        ts: nowIsoFn(),
        url: source.url,
        final_url: pageData.finalUrl || source.url,
        host: source.host,
        status: sourceStatusCode,
        outcome: sourceFetchOutcome,
        fetch_ms: fetchDurationMs,
        content_type: fetchContentType,
        title: pageData.title || '',
        html_chars: String(pageData.html || '').length,
        network_count: Array.isArray(pageData.networkResponses) ? pageData.networkResponses.length : 0,
        dom_snippet_uri: domSnippetUri || null,
        screenshot_uri: screenshotUri || null
      },
      ringSize: Math.max(10, toIntFn(config.runtimeTraceFetchRing, 30))
    });
    logger?.info?.('fetch_trace_written', {
      url: source.url,
      status: sourceStatusCode,
      fetch_ms: fetchDurationMs,
      content_type: fetchContentType,
      trace_path: fetchTrace.trace_path
    });

    const htmlPreview = String(pageData.html || '').slice(0, 200_000);
    if (htmlPreview) {
      const htmlTrace = await traceWriter.writeText({
        section: 'fetch_html_preview',
        prefix: 'fetch',
        extension: 'html',
        text: htmlPreview,
        ringSize: Math.max(10, toIntFn(config.runtimeTraceFetchRing, 30)),
        contentType: 'text/html; charset=utf-8'
      });
      logger?.info?.('artifact_written', {
        kind: 'html_preview',
        path: htmlTrace.trace_path
      });
    }

    const networkRows = Array.isArray(pageData.networkResponses) ? pageData.networkResponses.slice(0, 40) : [];
    if (networkRows.length > 0) {
      const networkTrace = await traceWriter.writeJson({
        section: 'fetch_network_preview',
        prefix: 'fetch',
        payload: networkRows,
        ringSize: Math.max(10, toIntFn(config.runtimeTraceFetchRing, 30))
      });
      logger?.info?.('artifact_written', {
        kind: 'network_preview',
        path: networkTrace.trace_path
      });
    }
  }

  return {
    domSnippetArtifact,
    artifactHostKey,
    domSnippetUri,
    screenshotArtifact,
    screenshotUri,
    screenshotFileUri,
    pageArtifactsPersisted,
    pageHtmlUri,
    ldjsonUri,
    embeddedStateUri,
    networkResponsesUri,
    nextArtifactSequence
  };
}
