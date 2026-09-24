import http from 'node:http';
import https from 'node:https';

// Keep the shared backend credential on the local Vite server, not in the bundle.
export function conversationGateway({ target, token }) {
  const upstream = new URL(target);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password) {
    throw new Error('BACKEND_URL must be an HTTP(S) origin');
  }
  console.info('[gateway.configured]', { upstream: upstream.origin, credential_configured: !!token });
  function middleware(req, res, next) {
    if (!req.url?.startsWith('/api/')) return next();
    const started = Date.now();
    const requestPath = req.url.split('?')[0];
    res.on('finish', () => console.info('[gateway.http]', { method: req.method, path: requestPath, status: res.statusCode, ms: Date.now() - started }));
    const error = (status, code) => {
      console.warn('[gateway.failed]', { method: req.method, path: requestPath, status, code });
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) return res.destroy();
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { code } }));
    };
    const origin = req.headers.origin;
    try {
      if (origin && new URL(origin).host !== req.headers.host) return error(403, 'ORIGIN_DENIED');
    } catch { return error(403, 'ORIGIN_DENIED'); }
    const url = new URL(req.url, 'http://localhost');
    const isTranscription = req.method === 'POST' && url.pathname === '/api/v1/audio/transcriptions';
    const isStatus = req.method === 'GET' && (url.pathname === '/api/v1/status' || /^\/api\/v1\/devices\/[a-zA-Z0-9_-]+(?:\/(?:events|print-queue))?$/.test(url.pathname));
    const isResolution = req.method === 'POST' && /^\/api\/v1\/devices\/[a-zA-Z0-9_-]+\/print-jobs\/[a-zA-Z0-9_-]+\/resolve$/.test(url.pathname);
    const allowed = req.method === 'POST'
      ? isTranscription || isResolution || /^\/api\/v1\/sessions(?:\/[a-zA-Z0-9_-]+\/messages)?$/.test(url.pathname)
      : isStatus || (req.method === 'GET' && /^\/api\/v1\/sessions\/[a-zA-Z0-9_-]+(?:\/events)?$/.test(url.pathname));
    if (!allowed || url.search) return error(404, 'NOT_FOUND');
    if (!token) return error(503, 'BACKEND_NOT_CONFIGURED');
    const headers = { Authorization: `Bearer ${token}` };
    for (const name of ['content-type', 'content-length', 'last-event-id']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const client = (upstream.protocol === 'https:' ? https : http).request(new URL(url.pathname, upstream), {
      method: req.method, headers,
    }, incoming => {
      if (incoming.headers['content-type']?.includes('text/event-stream')) console.info('[gateway.sse.open]', { path: requestPath });
      res.writeHead(incoming.statusCode, {
        'Content-Type': incoming.headers['content-type'] || 'application/json',
        'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no',
        ...(incoming.headers['x-request-id'] ? { 'X-Request-ID': incoming.headers['x-request-id'] } : {}),
      });
      incoming.on('error', error => { console.warn('[gateway.upstream_stream_failed]', { path: requestPath, code: error.code }); res.destroy(); });
      incoming.pipe(res);
    });
    client.setTimeout(isTranscription ? 135000 : 30000, () => { error(504, isTranscription ? 'ASR_TIMEOUT' : 'BACKEND_UNAVAILABLE'); client.destroy(); });
    client.on('error', cause => { console.warn('[gateway.connection_failed]', { path: requestPath, code: cause.code }); error(502, 'BACKEND_UNAVAILABLE'); });
    req.on('aborted', () => client.destroy());
    res.on('close', () => client.destroy());
    req.pipe(client);
  }
  return {
    name: 'conversation-gateway',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
