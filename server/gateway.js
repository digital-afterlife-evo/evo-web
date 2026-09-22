import http from 'node:http';
import https from 'node:https';

// Keep the shared backend credential on the local Vite server, not in the bundle.
export function conversationGateway({ target, token }) {
  const upstream = new URL(target);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password) {
    throw new Error('BACKEND_URL must be an HTTP(S) origin');
  }
  function middleware(req, res, next) {
    if (!req.url?.startsWith('/api/')) return next();
    const error = (status, code) => {
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
    const allowed = req.method === 'POST'
      ? isTranscription || /^\/api\/v1\/sessions(?:\/[a-zA-Z0-9_-]+\/messages)?$/.test(url.pathname)
      : req.method === 'GET' && /^\/api\/v1\/sessions\/[a-zA-Z0-9_-]+(?:\/events)?$/.test(url.pathname);
    if (!allowed || url.search) return error(404, 'NOT_FOUND');
    if (!token) return error(503, 'BACKEND_NOT_CONFIGURED');
    const headers = { Authorization: `Bearer ${token}` };
    for (const name of ['content-type', 'content-length', 'last-event-id']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const client = (upstream.protocol === 'https:' ? https : http).request(new URL(url.pathname, upstream), {
      method: req.method, headers,
    }, incoming => {
      res.writeHead(incoming.statusCode, {
        'Content-Type': incoming.headers['content-type'] || 'application/json',
        'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no',
      });
      incoming.on('error', () => res.destroy());
      incoming.pipe(res);
    });
    client.setTimeout(isTranscription ? 135000 : 30000, () => { error(504, isTranscription ? 'ASR_TIMEOUT' : 'BACKEND_UNAVAILABLE'); client.destroy(); });
    client.on('error', () => error(502, 'BACKEND_UNAVAILABLE'));
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
