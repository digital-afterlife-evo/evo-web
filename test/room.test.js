import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, initialConversation, activeActivity, exportConversation } from '../src/chat.js';

test('activities are owned by their request, have terminal states and do not overwrite active work', () => {
  let state = applyEvent(initialConversation, { type: 'request.accepted', request_id: 'r1', data: { user_message: { id: 'u1', text: 'hello', role: 'user' } } });
  const thought = { id: 'a1', state: 'thinking', summary: '组织回答', activity_status: 'running' };
  const tool = { id: 'a2', state: 'tool_calling', summary: '查询设备', activity_status: 'running' };
  for (const data of [thought, tool]) state = applyEvent(state, { type: 'activity.started', request_id: 'r1', data });
  assert.equal(activeActivity(state.activities).id, 'a2');
  state = applyEvent(state, { type: 'activity.completed', request_id: 'r1', data: { ...thought, activity_status: 'completed' } });
  assert.equal(activeActivity(state.activities).id, 'a2');
  state = applyEvent(state, { type: 'activity.completed', request_id: 'r1', data: { ...tool, activity_status: 'completed' } });
  assert.equal(activeActivity(state.activities), null);
  assert.equal(applyEvent(state, { type: 'activity.started', request_id: 'r1', data: tool }), state);
  state = applyEvent(state, { type: 'request.completed', request_id: 'r1', data: {} });
  state = applyEvent(state, { type: 'request.accepted', request_id: 'r2', data: { user_message: { id: 'u2', text: 'new', role: 'user' } } });
  assert.equal(state.activities.length, 0);
  assert.equal(applyEvent(state, { type: 'activity.failed', request_id: 'r1', data: thought }), state);
});

test('snapshot restores only the current request activities and search has priority when actually running', () => {
  const activities = [
    { id: 'a1', state: 'typing', activity_status: 'running' },
    { id: 'a2', state: 'searching', activity_status: 'running' },
  ];
  const state = applyEvent(initialConversation, { type: 'snapshot', data: {
    messages: [], requests: [{ id: 'old', status: 'completed', activities: [{ id: 'old-activity' }] }, { id: 'current', status: 'running', activities }],
  } });
  assert.equal(state.requestId, 'current');
  assert.deepEqual(state.activities, activities);
  assert.equal(activeActivity(state.activities).id, 'a2');
  assert.equal(activeActivity([{ state: 'searching', activity_status: 'completed' }]), null);
});

test('plain text export preserves Unicode and incomplete text but excludes internal metadata', () => {
  const output = exportConversation([
    { role: 'user', text: '你好\n世界', provider_key: 'never-export' },
    { role: 'assistant', text: '未完成的回复', status: 'incomplete', tools: { api_key: 'never-export' } },
  ]);
  assert.match(output, /你\n你好\n世界/);
  assert.match(output, /数字余生\n未完成的回复\n\[回复未完成\]/);
  assert.doesNotMatch(output, /never-export|provider_key|api_key/);
});
