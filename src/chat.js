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
  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(new Error(errorText('BACKEND_UNAVAILABLE')), { code: 'BACKEND_UNAVAILABLE' });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data.error?.code || 'BACKEND_UNAVAILABLE';
    throw Object.assign(new Error(errorText(code)), { code, status: response.status });
  }
  return data;
}

export const initialConversation = { messages: [], activeRequest: null, problem: null, finishedRequests: [] };

function upsert(messages, message) {
  const index = messages.findIndex(item => item.id === message.id);
  return index < 0 ? [...messages, message] : messages.map((item, i) => i === index ? { ...item, ...message } : item);
}

// Only consume conversation data. Activity, memory and device events have no UI in this design.
export function applyEvent(state, event) {
  const data = event.data;
  if (event.type === 'snapshot') {
    const last = data.requests.at(-1);
    return {
      messages: data.messages,
      activeRequest: data.requests.find(request => request.status === 'running')?.id || null,
      problem: last?.error ? errorText(last.error.code) : null,
      finishedRequests: data.requests.filter(request => request.status !== 'running').slice(-32).map(request => request.id),
    };
  }
  if (event.type === 'request.accepted') {
    if (state.finishedRequests.includes(event.request_id)) return state;
    return { ...state, activeRequest: event.request_id, problem: null, messages: upsert(state.messages, data.user_message) };
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
    return { ...state, messages, activeRequest: null, problem: data.error ? errorText(data.error.code) : null, finishedRequests };
  }
  return state;
}

export function nextAttempt(previous, text) {
  return previous?.text === text ? previous : { client_message_id: crypto.randomUUID(), text };
}
