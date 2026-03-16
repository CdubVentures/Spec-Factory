const MIME_TYPE_MAP = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

export function resolveStaticMimeType(ext) {
  return MIME_TYPE_MAP[ext] || 'application/octet-stream';
}

export function createGuiStaticFileServer({
  distRoot,
  pathModule,
  createReadStream,
} = {}) {
  if (typeof createReadStream !== 'function') {
    throw new TypeError('createReadStream must be a function');
  }
  if (!pathModule || typeof pathModule.join !== 'function' || typeof pathModule.extname !== 'function') {
    throw new TypeError('pathModule must provide join/extname');
  }

  return function serveStatic(req, res) {
    const requestUrl = String(req?.url || '/');
    let filePath = pathModule.join(distRoot, requestUrl === '/' ? 'index.html' : requestUrl.split('?')[0]);
    const ext = pathModule.extname(filePath);
    if (!ext) {
      filePath = pathModule.join(distRoot, 'index.html');
    }

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      const indexPath = pathModule.join(distRoot, 'index.html');
      const indexStream = createReadStream(indexPath);
      indexStream.on('error', () => {
        res.statusCode = 404;
        res.end('Not Found');
      });
      res.setHeader('Content-Type', 'text/html');
      indexStream.pipe(res);
    });

    const contentType = resolveStaticMimeType(pathModule.extname(filePath) || '.html');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    stream.pipe(res);
  };
}
