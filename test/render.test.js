import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { initialConversation } from '../src/chat.js';

test('both scenes render with real component imports and honest disconnected states', async t => {
  const vite = await createServer({ cacheDir: '.cache/render-vite', server: { middlewareMode: true }, appType: 'custom' });
  t.after(() => vite.close());
  const { default: Landing } = await vite.ssrLoadModule('/src/Landing.jsx');
  const { default: Conversation } = await vite.ssrLoadModule('/src/Conversation.jsx');
  const home = renderToStaticMarkup(React.createElement(Landing, { navigate() {}, voice() {}, continueSession: false }));
  assert.match(home, /人会离开/);
  assert.match(home, /对话还在/);
  assert.match(home, /与数字分身对话/);
  assert.match(home, /生命在于/);
  assert.match(home, /逐步接入 Evolver/);
  assert.match(home, /即使有一天，人已离开/);
  assert.match(home, /用声音开始/);
  assert.match(home, /id="about"/);
  assert.match(home, /typewriter\.webp/);
  assert.match(home, /film-strip-down/);
  assert.match(home, /film-strip-up/);
  assert.equal((home.match(/class="emerging-letter"/g) || []).length, 1);
  assert.match(home, /class="letter-memories"><p>说话的语气。<\/p><p>一起经历的日常。<\/p><p>看世界的方式。<\/p>/);
  assert.doesNotMatch(home, /memory-ring|memory-sculpture|orbital-guide/);
  assert.doesNotMatch(home, /preserveAspectRatio="none"/);
  const chat = { ...initialConversation, sessionId: null, loading: false, busy: false, send() {}, newSession() {} };
  const speech = { phase: 'idle', busy: false, levels: [], seconds: 0 };
  const service = { status: { device: { connection: 'not_connected', recent_jobs: [] } }, loading: false, error: false };
  const props = { chat, speech, service, draft: '', setDraft() {}, navigate() {}, startVoice() {} };
  const room = renderToStaticMarkup(React.createElement(Conversation, props));
  assert.match(room, /实体设备未连接/);
  assert.match(room, /新对话/);
  assert.match(room, /textarea[^>]*id="message"/);
  assert.match(room, /等待你的下一句话/);
  assert.doesNotMatch(room, /机器正在打印|正在听你说/);
  const faultRoom = renderToStaticMarkup(React.createElement(Conversation, { ...props, service: { ...service, status: { device: { connection: 'connected', board: { websocket_connected: true, host_state: 'fault' } } } } }));
  assert.match(faultRoom, /打字机接口故障，外接键盘已暂停/);
  assert.match(faultRoom, /RST/);
  assert.doesNotMatch(faultRoom, /status-dot is-connected|实体设备未连接/);
  const queue = { state: 'needs_confirmation', pending_turns: 2, head: { turn_number: 3, role: 'you' }, current_job: { id: 'job', turn_number: 3, role: 'you', part_index: 2, part_count: 4 } };
  const queuedProps = { ...props, service: { ...service, status: { device: { connection: 'connected', print_queue: queue } }, resolvePrint() {} } };
  const uncertainRoom = renderToStaticMarkup(React.createElement(Conversation, queuedProps));
  assert.match(uncertainRoom, /打印结果待确认，队列已暂停/);
  assert.match(uncertainRoom, /已完整打印/);
  assert.match(uncertainRoom, /重新打印此块/);
  const offlineRoom = renderToStaticMarkup(React.createElement(Conversation, { ...queuedProps, service: { ...queuedProps.service, error: true } }));
  assert.match(offlineRoom, /连接中断，打印状态待同步/);
  assert.match(offlineRoom, /disabled="">重新打印此块/);
  const errorRoom = renderToStaticMarkup(React.createElement(Conversation, {
    ...props, chat: { ...chat, messages: [{ id: 'm', role: 'assistant', status: 'incomplete', text: '<script>private</script>' }] },
    speech: { ...speech, error: '没有获得麦克风权限' },
  }));
  assert.match(errorRoom, /&lt;script&gt;private&lt;\/script&gt;/);
  assert.match(errorRoom, /回复未完成/);
  assert.match(errorRoom, /没有获得麦克风权限/);
});
