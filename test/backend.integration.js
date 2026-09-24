import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { conversationGateway } from '../server/gateway.js';
import { applyEvent, initialConversation } from '../src/chat.js';
import { appendTranscript } from '../src/speech.js';

// The integration check uses the adjacent backend and a local model fixture, never a paid model.
const require = createRequire(import.meta.url);
const { createBackendServer } = require('../../evo-backend/src/backend/server.js');
const { loadConfig } = require('../../evo-backend/src/backend/index.js');
const { sseData } = require('../../evo-backend/src/backend/model.js');

test('frontend gateway and conversation reducer work with the actual backend', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'web-backend-integration-'));
  let modelCalls = 0;
  let asrCalls = 0;
  let translationCalls = 0;
  const model = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.messages[0]?.content?.[0]?.type === 'input_audio') {
      asrCalls++;
      assert.equal(body.model, 'qwen3-asr-flash');
      assert.equal(body.stream, false);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { content: '你好，验证语音输入。' }, finish_reason: 'stop' }] }));
    }
    if (body.stream === false && !body.tools) {
      translationCalls++;
      const source = JSON.parse(body.messages[1].content).text;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { content: source.includes('这是接口测试回复') ? 'English reply.' : 'English input.' }, finish_reason: 'stop' }] }));
    }
    modelCalls++;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '这是接口测试回复，' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '不是实际模型生成。' } }] })}\n\n`);
    res.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
  const backend = createBackendServer({
    ...loadConfig({ BACKEND_WEB_TOKEN: 'integration-web', BACKEND_DEVICE_TOKEN: 'integration-device' }),
    host: '127.0.0.1', port: 0, dataDir: directory,
    modelBaseUrl: `http://127.0.0.1:${model.address().port}/v1`, model: 'fixture', modelApiKey: 'fixture-key',
    asrBaseUrl: `http://127.0.0.1:${model.address().port}/compatible-mode/v1`, asrApiKey: 'fixture-asr-key',
  });
  await backend.start();
  let middleware;
  conversationGateway({ target: `http://127.0.0.1:${backend.server.address().port}`, token: 'integration-web' })
    .configureServer({ middlewares: { use(value) { middleware = value; } } });
  const gateway = http.createServer((req, res) => middleware(req, res, () => res.end()));
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.address().port}/api/v1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  t.after(async () => {
    clearTimeout(timeout); controller.abort();
    gateway.closeAllConnections(); model.closeAllConnections();
    await Promise.all([backend.close(), new Promise(resolve => gateway.close(resolve)), new Promise(resolve => model.close(resolve))]);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  async function post(route, body) {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    assert.ok(response.ok, `HTTP ${response.status}`);
    return response.json();
  }
  const audio = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]);
  const transcription = await fetch(base + '/audio/transcriptions', {
    method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus' }, body: audio, signal: controller.signal,
  });
  assert.equal(transcription.status, 200);
  const recognized = await transcription.json();
  assert.equal(asrCalls, 1);
  assert.equal(modelCalls, 0);
  assert.equal(backend.backend.store.data.sessions.length, 0);
  const session = await post('/sessions', {});
  const response = await fetch(`${base}/sessions/${session.id}/events`, { signal: controller.signal });
  let state = initialConversation;
  let lastEventId;
  const reading = (async () => {
    for await (const data of sseData(response.body)) {
      const event = JSON.parse(data);
      state = applyEvent(state, event); lastEventId = event.event_id;
      if (event.type === 'request.completed') break;
    }
  })();
  const body = { client_message_id: 'web-integration-1', text: appendTranscript('已有草稿。', recognized.text) };
  await post(`/sessions/${session.id}/messages`, body);
  await reading;
  while (backend.backend.store.data.print_segments.some(s => s.status !== 'ready')) {
    controller.signal.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(state.messages[0].text, body.text);
  assert.equal(state.messages.at(-1).text, '这是接口测试回复，不是实际模型生成。');
  assert.equal(state.activeRequest, null);
  assert.equal(backend.backend.store.data.jobs.length, 0);
  assert.equal((await post(`/sessions/${session.id}/messages`, body)).duplicate, true);
  assert.equal(modelCalls, 1);
  assert.equal(translationCalls, 2);
  const snapshot = await (await fetch(`${base}/sessions/${session.id}`, { signal: controller.signal })).json();
  assert.deepEqual(applyEvent(initialConversation, { type: 'snapshot', data: snapshot }).messages, state.messages);
  const replay = await fetch(`${base}/sessions/${session.id}/events`, { signal: controller.signal, headers: { 'Last-Event-ID': 'expired' } });
  for await (const data of sseData(replay.body)) {
    const event = JSON.parse(data);
    assert.equal(event.type, 'snapshot');
    assert.equal(event.data.requests[0].status, 'completed');
    break;
  }
  assert.ok(lastEventId);
  const info = await (await fetch(base + '/status', { signal: controller.signal })).json();
  assert.equal(info.device.device_id, 'typewriter');
  assert.equal(info.device.connection, 'not_connected');
  const deviceResponse = await fetch(base + '/devices/typewriter/events', { signal: controller.signal });
  const deviceEvents = (async () => {
    for await (const data of sseData(deviceResponse.body)) {
      const event = JSON.parse(data);
      if (event.type === 'snapshot') assert.equal(event.data.connection, 'not_connected');
      if (event.type === 'device.updated') { assert.equal(event.data.connection, 'connected'); return; }
    }
    assert.fail('Device connection event was not delivered');
  })();
  const connected = await fetch(`http://127.0.0.1:${backend.server.address().port}/api/v1/devices/typewriter/connect`, {
    method: 'POST', headers: { Authorization: 'Bearer integration-device', 'Content-Type': 'application/json' }, body: JSON.stringify({ capabilities: {} }), signal: controller.signal,
  });
  assert.equal(connected.status, 200); await connected.json();
  await deviceEvents;
  const deviceSnapshot = await (await fetch(base + '/devices/typewriter', { signal: controller.signal })).json();
  assert.equal(deviceSnapshot.connection, 'connected');
  assert.equal(backend.backend.store.data.jobs.length, 0);
  const queue = await (await fetch(base + '/devices/typewriter/print-queue', { signal: controller.signal })).json();
  assert.equal(queue.pending_turns, 1);
  assert.equal(queue.state, 'waiting_capabilities');
  const deviceBase = `http://127.0.0.1:${backend.server.address().port}/api/v1/devices/typewriter`;
  async function devicePost(route, body) {
    const response = await fetch(deviceBase + route, { method: 'POST', headers: { Authorization: 'Bearer integration-device', 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    assert.equal(response.status, 200); return response.json();
  }
  const device = await devicePost('/connect', { capabilities: { charset: 'ascii', max_chars: 4000, supports_newline: true, print_completed: true } });
  async function command() {
    const response = await fetch(deviceBase + '/commands', { headers: { Authorization: 'Bearer integration-device', 'X-Connection-ID': device.connection_id }, signal: controller.signal });
    assert.equal(response.status, 200); return response.json();
  }
  const first = await command();
  assert.equal(first.text, 'TURN 0001\nYOU:\nEnglish input.\n\n');
  await devicePost(`/print-jobs/${first.job_id}/events`, { connection_id: device.connection_id, status: 'failed' });
  const resolved = await post(`/devices/typewriter/print-jobs/${first.job_id}/resolve`, { action: 'confirm_completed' });
  assert.notEqual(resolved.print_queue.state, 'needs_confirmation');
  const second = await command();
  assert.equal(second.text, 'THEM:\nEnglish reply.\n\n');
  await devicePost(`/print-jobs/${second.job_id}/events`, { connection_id: device.connection_id, status: 'completed' });
  assert.equal((await (await fetch(base + '/devices/typewriter/print-queue', { signal: controller.signal })).json()).pending_turns, 0);
});
