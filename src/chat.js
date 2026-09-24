const STORAGE_KEY = 'digital-afterlife.session';

export function savedSession() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return /^[a-zA-Z0-9_-]{1,128}$/.test(value || '') ? value : null;
  } catch { return null; }
}

export function saveSession(id) {
  try { id ? localStorage.setItem(STORAGE_KEY, id) : localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
}

const errors = {
  BACKEND_NOT_CONFIGURED: '对话服务还没有连接好，你写下的内容已保留。',
  BACKEND_UNAVAILABLE: '暂时连接不上对话服务，你写下的内容已保留。',
  MODEL_NOT_CONFIGURED: '对话服务暂未就绪，你写下的内容已保留。',
  MODEL_UNAVAILABLE: '暂时无法生成回复，请稍后再试。',
  MODEL_HTTP_ERROR: '回复服务暂时不可用，请稍后再试。',
  MODEL_TIMEOUT: '等待回复超时，请稍后再试。',
  MODEL_INCOMPLETE: '回复中断，已收到的文字为不完整内容。',
  INTERRUPTED: '这次回复已中断，已收到的文字为不完整内容。',
  AGENT_BUSY: '当前有一条回复正在生成，请稍后再发送。',
  UNAUTHORIZED: '对话服务暂时无法连接，你写下的内容已保留。',
  FORBIDDEN: '对话服务暂时无法连接，你写下的内容已保留。',
  EMPTY_MESSAGE: '请先写下一些内容。',
  MESSAGE_TOO_LARGE: '这段文字太长了，请缩短后再发送。',
};

export function errorText(code) {
  return errors[code] || '这次对话没有完成，你可以稍后重试。';
}

export async function api(path, body) {
  const started = performance.now();
  const method = body === undefined ? 'GET' : 'POST';
  console.info('[web.api.request]', { method, path });
  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.warn('[web.api.network_failed]', { method, path, error: error.name, ms: Math.round(performance.now() - started) });
    throw Object.assign(new Error(errorText('BACKEND_UNAVAILABLE')), { code: 'BACKEND_UNAVAILABLE' });
  }
  const data = await response.json().catch(() => ({}));
  console.info('[web.api.response]', { method, path, status: response.status, trace_id: response.headers.get('x-request-id'), ms: Math.round(performance.now() - started) });
  if (!response.ok) {
    const code = data.error?.code || 'BACKEND_UNAVAILABLE';
    console.warn('[web.api.failed]', { method, path, status: response.status, code });
    throw Object.assign(new Error(errorText(code)), { code, status: response.status });
  }
  return data;
}

export const initialConversation = { messages: [], activeRequest: null, requestId: null, activities: [], problem: null, finishedRequests: [] };

function upsert(messages, message) {
  const index = messages.findIndex(item => item.id === message.id);
  return index < 0 ? [...messages, message] : messages.map((item, i) => i === index ? { ...item, ...message } : item);
}

// Activities belong to a request; device events are handled by the separate status subscription.
export function applyEvent(state, event) {
  const data = event.data;
  if (event.type === 'snapshot') {
    const last = data.requests.at(-1);
    return {
      messages: data.messages,
      activeRequest: data.requests.find(request => request.status === 'running')?.id || null,
      requestId: last?.id || null,
      activities: last?.activities || [],
      problem: last?.error ? errorText(last.error.code) : null,
      finishedRequests: data.requests.filter(request => request.status !== 'running').slice(-32).map(request => request.id),
    };
  }
  if (event.type === 'request.accepted') {
    if (state.finishedRequests.includes(event.request_id)) return state;
    return { ...state, activeRequest: event.request_id, requestId: event.request_id, activities: [], problem: null, messages: upsert(state.messages, data.user_message) };
  }
  if (['activity.started', 'activity.completed', 'activity.failed'].includes(event.type)) {
    if (event.request_id !== state.requestId || !state.activeRequest || !data.id) return state;
    const previous = state.activities.find(activity => activity.id === data.id);
    if (previous && previous.activity_status !== 'running') return state;
    return { ...state, activities: upsert(state.activities, data) };
  }
  if (event.type === 'message.delta') {
    const previous = state.messages.find(message => message.id === data.message_id);
    // A terminal message is authoritative; a delayed delta cannot extend it.
    if (previous && previous.status !== 'streaming') return state;
    return { ...state, messages: upsert(state.messages, {
      id: data.message_id, request_id: event.request_id, role: 'assistant', status: 'streaming',
      text: (previous?.text || '') + data.text,
    }) };
  }
  if (event.type === 'message.completed') return { ...state, messages: upsert(state.messages, data) };
  if (event.type === 'request.completed' || event.type === 'request.failed') {
    if (state.finishedRequests.includes(event.request_id)) return state;
    const messages = data.partial_message ? upsert(state.messages, data.partial_message) : state.messages;
    const finishedRequests = [...new Set([...state.finishedRequests, event.request_id])].slice(-32);
    if (state.activeRequest && state.activeRequest !== event.request_id) return { ...state, messages, finishedRequests };
    return { ...state, messages, activeRequest: null, activities: data.activities || state.activities, problem: data.error ? errorText(data.error.code) : null, finishedRequests };
  }
  return state;
}

export function nextAttempt(previous, text) {
  return previous?.text === text ? previous : { client_message_id: crypto.randomUUID(), text };
}

export function activeActivity(activities) {
  const priority = { searching: 4, tool_calling: 3, typing: 2, thinking: 1 };
  return activities.filter(activity => activity.activity_status === 'running')
    .sort((a, b) => (priority[b.state] || 0) - (priority[a.state] || 0)).at(0) || null;
}

export function exportConversation(messages) {
  return '数字余生 · 未完来信\n\n' + messages.map(message => {
    const role = message.role === 'user' ? '你' : '数字余生';
    return `${role}\n${message.text}${message.status === 'incomplete' ? '\n[回复未完成]' : ''}`;
  }).join('\n\n——\n\n') + '\n';
}
