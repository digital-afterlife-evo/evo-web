import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applyEvent, initialConversation, nextAttempt, errorText, activeActivity, exportConversation } from '../src/chat.js';
import { conversationGateway } from '../server/gateway.js';

test('conversation stream preserves text and terminal states across snapshots and late events', () => {
  let state = applyEvent(initialConversation, { type: 'request.accepted', request_id: 'r1', data: { user_message: { id: 'u1', role: 'user', text: '你好' } } });
  state = applyEvent(state, { type: 'message.delta', request_id: 'r1', data: { message_id: 'a1', text: '你好，' } });
  state = applyEvent(state, { type: 'message.delta', request_id: 'r1', data: { message_id: 'a1', text: '世界。' } });
  state = applyEvent(state, { type: 'message.completed', request_id: 'r1', data: { id: 'a1', role: 'assistant', text: '你好，世界。', status: 'completed' } });
  state = applyEvent(state, { type: 'request.completed', request_id: 'r1', data: {} });
  assert.equal(state.messages.at(-1).text, '你好，世界。');
  assert.equal(state.activeRequest, null);
  assert.deepEqual(applyEvent(state, { type: 'message.delta', request_id: 'r1', data: { message_id: 'a1', text: '重复' } }), state);
  assert.deepEqual(applyEvent(state, { type: 'request.accepted', request_id: 'r1', data: {} }), state);
  assert.deepEqual(applyEvent(state, { type: 'request.failed', request_id: 'r1', data: { error: { code: 'MODEL_TIMEOUT' } } }), state);
  state = applyEvent(state, { type: 'request.accepted', request_id: 'r2', data: { user_message: { id: 'u2', role: 'user', text: '再次问好' } } });
  state = applyEvent(state, { type: 'request.failed', request_id: 'r1', data: { error: { code: 'MODEL_TIMEOUT' } } });
  assert.equal(state.activeRequest, 'r2');
  assert.equal(state.problem, null);
  const snapshot = { messages: state.messages, requests: [{ id: 'r1', status: 'completed' }, { id: 'r2', status: 'running' }] };
  state = applyEvent(state, { type: 'snapshot', data: snapshot });
  assert.equal(state.activeRequest, 'r2');
  assert.deepEqual(state.finishedRequests, ['r1']);
});

test('incomplete reply remains readable and unused events never change the conversation', () => {
  const partial = { id: 'a1', text: '未完成的回答', role: 'assistant', status: 'incomplete' };
  const state = applyEvent({ ...initialConversation, activeRequest: 'r1' }, {
    type: 'request.failed', request_id: 'r1', data: { partial_message: partial, error: { code: 'MODEL_INCOMPLETE' } },
  });
  assert.deepEqual(state.messages, [partial]);
  assert.equal(state.activeRequest, null);
  assert.match(state.problem, /不完整/);
  for (const type of ['activity.started', 'device.updated', 'print.updated']) assert.equal(applyEvent(state, { type, data: {} }), state);
  const attempt = nextAttempt(null, '同一段文字');
  assert.equal(nextAttempt(attempt, '同一段文字'), attempt);
  assert.notEqual(nextAttempt(attempt, '另一段文字').client_message_id, attempt.client_message_id);
  assert.doesNotMatch(errorText('MODEL_HTTP_ERROR'), /key|token|Bearer/i);
});

test('gateway keeps credentials server-side, limits endpoints, rejects foreign origins and forwards SSE', async t => {
  const received = [];
  const upstream = http.createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    if (req.url.endsWith('/events')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('id: evt-1\nevent: message.delta\ndata: {"text":"你好"}\n\n');
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"id":"session-1"}');
    }
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  let middleware;
  conversationGateway({ target: `http://127.0.0.1:${upstream.address().port}`, token: 'server-only-secret' })
    .configureServer({ middlewares: { use(fn) { middleware = fn; } } });
  const server = http.createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/v1/sessions', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', Authorization: 'Bearer spoofed' }, body: '{}' });
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /secret/);
  assert.equal(received[0].headers.authorization, 'Bearer server-only-secret');
  assert.equal(received[0].headers.origin, undefined);
  const events = await fetch(base + '/api/v1/sessions/session-1/events', { headers: { 'Last-Event-ID': 'previous' } });
  assert.equal(events.headers.get('content-type'), 'text/event-stream');
  assert.match(await events.text(), /你好/);
  assert.equal(received[1].headers['last-event-id'], 'previous');
  for (const route of ['/api/v1/devices/typewriter/commands', '/api/v1/devices/typewriter/heartbeat', '/api/v1/sessions/a?token=x']) {
    const denied = await fetch(base + route); assert.equal(denied.status, 404); await denied.text();
  }
  const foreign = await fetch(base + '/api/v1/sessions', { method: 'POST', headers: { Origin: 'http://evil.example' }, body: '{}' });
  assert.equal(foreign.status, 403); await foreign.text();
  assert.equal(received.length, 2);
  for (const route of ['/api/v1/status', '/api/v1/devices/typewriter', '/api/v1/devices/typewriter/events', '/api/v1/devices/typewriter/print-queue']) {
    const allowed = await fetch(base + route); assert.equal(allowed.status, 200); await allowed.text();
  }
  const write = await fetch(base + '/api/v1/devices/typewriter/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(write.status, 404); await write.text();
  const resolve = await fetch(base + '/api/v1/devices/typewriter/print-jobs/job-1/resolve', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{"action":"retry"}' });
  assert.equal(resolve.status, 200); await resolve.text();
  assert.equal(received.at(-1).headers.authorization, 'Bearer server-only-secret');
  assert.equal(received.length, 7);
  const recovery = await fetch(base + '/api/v1/devices/typewriter/recover', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(recovery.status, 200); await recovery.text();
  assert.equal(received.at(-1).headers.authorization, 'Bearer server-only-secret');
});

test('unconfigured gateway returns a controlled service error', async t => {
  let middleware;
  conversationGateway({ target: 'http://127.0.0.1:3000' }).configurePreviewServer({ middlewares: { use(fn) { middleware = fn; } } });
  const server = http.createServer((req, res) => middleware(req, res, () => res.end()));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/sessions`, { method: 'POST', body: '{}' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'BACKEND_NOT_CONFIGURED');
});
