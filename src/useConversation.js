import { useCallback, useEffect, useRef, useState } from 'react';
import { api, applyEvent, errorText, initialConversation, nextAttempt, savedSession, saveSession } from './chat.js';

const eventTypes = ['snapshot', 'request.accepted', 'message.delta', 'message.completed', 'request.completed', 'request.failed', 'activity.started', 'activity.completed', 'activity.failed'];

export function useConversation(enabled) {
  const [sessionId, setSessionId] = useState(savedSession);
  const sessionRef = useRef(sessionId);
  const [conversation, setConversation] = useState(initialConversation);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [attemptError, setAttemptError] = useState(null);
  const [retry, setRetry] = useState(0);
  const submittingRef = useRef(false);
  const attempt = useRef(null);
  const revision = useRef(0);

  const selectSession = useCallback(id => {
    sessionRef.current = id; saveSession(id); setSessionId(id);
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    let disposed = false, stream, lastSequence = -1;
    setLoading(true);
    setConnectionError(null);
    (async () => {
      try {
        const snapshot = await api(`/sessions/${sessionId}`);
        if (disposed || sessionRef.current !== sessionId) return;
        setConversation(applyEvent(initialConversation, { type: 'snapshot', data: snapshot }));
        stream = new EventSource(`/api/v1/sessions/${sessionId}/events`);
        stream.onopen = () => { console.info('[web.chat.sse_connected]', { session_id: sessionId }); if (!disposed) setConnectionError(null); };
        stream.onerror = () => { console.warn('[web.chat.sse_reconnecting]', { session_id: sessionId, ready_state: stream.readyState }); if (!disposed) setConnectionError('连接暂时中断，正在重连；已收到的文字会保留。'); };
        for (const type of eventTypes) stream.addEventListener(type, message => {
          if (disposed) return;
          let event;
          try { event = JSON.parse(message.data); } catch { return; }
          if (event.session_id !== sessionId || sessionRef.current !== sessionId) return;
          if (event.type === 'snapshot') lastSequence = -1;
          if (event.sequence <= lastSequence) return;
          lastSequence = event.sequence;
          revision.current++;
          if (type !== 'message.delta') console.info('[web.chat.event]', { type, session_id: sessionId, request_id: event.request_id, sequence: event.sequence, error_code: event.data?.error?.code });
          setConversation(current => applyEvent(current, event));
        });
      } catch (error) {
        if (disposed || sessionRef.current !== sessionId) return;
        if (error.status === 404) {
          selectSession(null); attempt.current = null;
          setConversation(initialConversation);
        } else setConnectionError(error.message);
      } finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; stream?.close(); console.info('[web.chat.sse_closed]', { session_id: sessionId }); };
  }, [enabled, sessionId, retry, selectSession]);

  async function send(text) {
    if (!text.trim() || submittingRef.current || conversation.activeRequest || loading) return false;
    submittingRef.current = true; setSubmitting(true); setAttemptError(null);
    let currentSession = sessionRef.current;
    try {
      if (!currentSession) {
        const session = await api('/sessions', {});
        currentSession = session.id; selectSession(session.id);
      }
      attempt.current = nextAttempt(attempt.current, text);
      const result = await api(`/sessions/${currentSession}/messages`, attempt.current);
      console.info('[web.chat.accepted]', { session_id: currentSession, request_id: result.request_id, duplicate: result.duplicate, chars: text.length });
      setConversation(current => ({ ...current, activeRequest: result.status === 'running' && !current.finishedRequests.includes(result.request_id) ? result.request_id : current.activeRequest }));
      // A fresh snapshot also recovers a reply that finished before the event stream opened.
      const beforeRead = revision.current;
      const snapshot = await api(`/sessions/${currentSession}`).catch(() => null);
      if (snapshot && revision.current === beforeRead) setConversation(applyEvent(initialConversation, { type: 'snapshot', data: snapshot }));
      attempt.current = null;
      if (connectionError) setRetry(value => value + 1);
      return true;
    } catch (error) {
      // The POST may have succeeded even when its response was lost. Reconcile before retrying.
      if (currentSession && attempt.current) {
        const beforeRead = revision.current;
        const snapshot = await api(`/sessions/${currentSession}`).catch(() => null);
        if (snapshot) {
          if (revision.current === beforeRead) setConversation(applyEvent(initialConversation, { type: 'snapshot', data: snapshot }));
          if (snapshot.requests.some(request => request.client_message_id === attempt.current.client_message_id)) {
            attempt.current = null; return true;
          }
        }
      }
      setAttemptError(error.message || errorText());
      return false;
    } finally { submittingRef.current = false; setSubmitting(false); }
  }

  async function newSession() {
    if (submittingRef.current || conversation.activeRequest || loading) return false;
    submittingRef.current = true; setCreating(true); setAttemptError(null);
    try {
      const session = await api('/sessions', {});
      selectSession(session.id); attempt.current = null;
      setConversation(initialConversation); setConnectionError(null);
      return true;
    } catch (error) { setAttemptError(error.message); return false; }
    finally { submittingRef.current = false; setCreating(false); }
  }

  return {
    ...conversation, sessionId, submitting, creating, loading,
    busy: !!conversation.activeRequest || submitting || creating || loading,
    error: attemptError || connectionError || conversation.problem,
    connectionError,
    reconnect() { setAttemptError(null); setRetry(value => value + 1); },
    send,
    newSession,
  };
}
