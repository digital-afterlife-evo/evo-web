import { useEffect, useRef, useState } from 'react';
import { Brand, Icon } from './Icons';
import StatusPanel from './StatusPanel';
import { activeActivity, exportConversation } from './chat';

const starters = ['最近有件事，想和你说。', '如果生命在于变化，你现在会怎么想？', '我们从今天开始聊吧。'];

export default function Conversation({ chat, speech, service, draft, setDraft, navigate, startVoice }) {
  const input = useRef(null), transcript = useRef(null), bottom = useRef(true);
  const drawer = useRef(null), newDialog = useRef(null), copyTimer = useRef(null);
  const [showLatest, setShowLatest] = useState(false);
  const [copied, setCopied] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [newError, setNewError] = useState(false);
  const activity = activeActivity(chat.activities);
  const tooLong = draft.length > 8000;
  const busy = chat.busy || speech.busy;
  const recording = speech.phase === 'recording';

  useEffect(() => {
    if (matchMedia('(pointer: fine)').matches) input.current?.focus();
    return () => clearTimeout(copyTimer.current);
  }, []);
  useEffect(() => {
    if (bottom.current && transcript.current) transcript.current.scrollTop = chat.messages.length ? transcript.current.scrollHeight : 0;
  }, [chat.messages, chat.activeRequest]);
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height = `${Math.min(input.current.scrollHeight, 154)}px`;
  }, [draft]);

  async function send(event) {
    event?.preventDefault();
    if (busy || tooLong || !draft.trim()) return;
    bottom.current = true; setShowLatest(false); setFeedback('');
    const submitted = draft;
    if (await chat.send(submitted)) { setDraft(current => current === submitted ? '' : current); speech.clearNotice(); }
  }

  async function copy(message) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(message.id); setFeedback('已复制回复。');
      clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch { setFeedback('复制失败，可以选中文字手动复制。'); }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([exportConversation(chat.messages)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `数字余生-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback('对话已准备导出。');
  }

  async function createNew() {
    setNewError(false);
    if (await chat.newSession()) {
      setDraft(''); speech.clearNotice(); newDialog.current?.close();
      bottom.current = true; setShowLatest(false); setFeedback('新的一页，已经打开。');
      if (matchMedia('(pointer: fine)').matches) input.current?.focus();
    } else setNewError(true);
  }

  const speechLabel = recording ? '停止录音并转写' : speech.phase === 'requesting' ? '等待麦克风权限' : speech.phase === 'transcribing' ? '正在转写' : '开始语音输入';
  const currentAction = chat.connectionError ? '连接暂时中断，正在恢复对话' : chat.creating ? '正在翻开新的一页' : chat.loading ? '正在载入对话' : activity?.summary || (chat.activeRequest ? '正在组织回答' : '等待你的下一句话');
  const micDisabled = speech.phase === 'requesting' || speech.phase === 'transcribing' || (chat.busy && !recording);

  return <div className="conversation-page">
    <header className="room-header"><Brand light onClick={event => { event.preventDefault(); navigate(''); }} /><a className="room-home" href="#" onClick={event => { event.preventDefault(); navigate(''); }}><Icon name="back" /><span>回到首页</span></a><div className="room-actions"><button className="room-action" onClick={download} disabled={!chat.messages.length || busy} aria-label="导出当前对话"><Icon name="download" /><span>导出文字</span></button><button className="room-action" disabled={busy} onClick={() => { setNewError(false); newDialog.current.showModal(); }}><Icon name="plus" /><span>新对话</span></button><button className="room-action status-toggle" aria-label="查看状态" onClick={() => drawer.current.showModal()}><Icon name="activity" /></button></div></header>
    <main className="room-layout" id="main-content">
      <section className="letter-sheet" aria-label="对话通信室">
        <div className="letter-heading"><span className="eyebrow">THE UNFINISHED LETTER</span><h1>未完来信</h1></div>
        <div className="conversation-status" role="status"><span className={`status-dot ${chat.activeRequest && !chat.connectionError ? 'is-active' : ''}`} /><span>{currentAction}</span><span className="conversation-count">{String(chat.messages.filter(message => message.role === 'user').length).padStart(2, '0')} / 来信</span></div>
        <div className="reading-area" ref={transcript} role="log" aria-label="对话记录" aria-live="polite" aria-relevant="additions text" onScroll={() => { const element = transcript.current; bottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72; setShowLatest(!bottom.current); }}>
          {!chat.messages.length && !chat.loading && <div className="empty-letter"><h2>如果还能对话，<br />你会先说什么？</h2><p className="empty-description">不必寻找完美的开场。<br />像从前一样，说一句就好。</p>{!draft && <div className="conversation-starters">{starters.map(text => <button key={text} onClick={() => { setDraft(text); input.current?.focus(); }}>{text}<Icon name="diagonal" /></button>)}</div>}</div>}
          {chat.messages.map((message, index) => <article className={`letter-message ${message.role === 'user' ? 'from-you' : 'from-agent'}`} key={message.id}>
            <div className="message-margin"><span>{String(index + 1).padStart(2, '0')}</span></div>
            <div className="message-content"><header><span className="message-author">{message.role === 'user' ? '你' : '数字余生'}</span><span className="message-rule" /><span className="message-origin">{message.role === 'user' ? 'SENT' : 'REPLY'}</span></header><p className="message-text">{message.text}{message.status === 'streaming' && <span className="text-cursor" aria-hidden="true" />}</p><div className="message-tools">{message.status === 'incomplete' && <span className="incomplete-label">回复未完成</span>}{message.role === 'assistant' && message.status !== 'streaming' && <button className="copy-message" aria-label={`复制第 ${index + 1} 条消息`} onClick={() => copy(message)}><Icon name={copied === message.id ? 'check' : 'copy'} /><span>{copied === message.id ? '已复制' : '复制'}</span></button>}</div></div>
          </article>)}
          {chat.submitting && <p className="request-note">来信正在送出…</p>}
          {chat.loading && <p className="request-note">正在找回上一次对话…</p>}
        </div>
        <div className="composer-wrap">
          {showLatest && <button className="latest-button" onClick={() => { bottom.current = true; setShowLatest(false); transcript.current.scrollTo({ top: transcript.current.scrollHeight, behavior: 'auto' }); }}>回到最新 <span aria-hidden="true">↓</span></button>}
          <form className={`letter-composer ${recording ? 'is-recording' : ''}`} onSubmit={send}>
            {speech.busy && <div className="recording-strip" role="status"><div className="speech-indicator"><span className="status-dot is-active" />{recording ? <><span className="recording-time">{String(Math.floor(speech.seconds / 60)).padStart(2, '0')}:{String(speech.seconds % 60).padStart(2, '0')}</span><span>正在听你说</span>{!!speech.levels.length && <span className="audio-wave" aria-hidden="true">{speech.levels.map((level, index) => <i key={index} style={{ height: `${3 + level * 18}px` }} />)}</span>}</> : <span>{speech.phase === 'requesting' ? '等待麦克风权限…' : '正在把声音写成文字…'}</span>}</div><button type="button" onClick={speech.cancel}>取消</button></div>}
            {(speech.error || chat.error || tooLong) && <div className="form-error" role="alert"><span>{tooLong ? '文字超过 8000 字，请删减后发送。所有转写内容均已保留。' : speech.error || chat.error}</span>{chat.connectionError && <button type="button" onClick={() => { chat.reconnect(); service.refresh(); }}>重新连接</button>}</div>}
            {speech.notice && !speech.error && <p className="form-notice" role="status">{speech.notice}</p>}
            <label htmlFor="message" className="sr-only">写下你想说的话</label>
            <textarea id="message" ref={input} value={draft} onChange={event => setDraft(event.target.value)} maxLength={8000} placeholder="把想说的话，写在这里…" rows="1" disabled={chat.submitting || chat.creating} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(); } }} />
            <div className="composer-actions"><div className="composer-left"><button className={`microphone-button ${recording ? 'is-recording' : ''}`} type="button" aria-label={speechLabel} title={chat.busy ? '回复完成后可录音' : speechLabel} aria-pressed={recording} disabled={micDisabled} onClick={() => recording ? speech.stop() : startVoice()}><Icon name={recording ? 'stop' : 'mic'} /></button><span className="composer-help">{speech.busy ? '转写后，确认文字再发送' : chat.busy ? '回复完成后可以继续发送' : 'Enter 发送 · Shift + Enter 换行'}</span></div><div className="composer-right">{draft.length > 7200 && <span className={`character-count ${tooLong ? 'over-limit' : ''}`}>{draft.length} / 8000</span>}<button className="send-button" type="submit" disabled={!draft.trim() || busy || tooLong}><span>发送</span><Icon name="arrow" /></button></div></div>
          </form>
          <p className="room-disclaimer">回复由 AI 生成。语音转写需确认后发送。</p>
          <span className="sr-only" role="status">{feedback}</span>
        </div>
      </section>
      <aside className="desktop-status" aria-label="对话与设备状态"><StatusPanel chat={chat} service={service} /></aside>
    </main>
    <footer className="room-footer"><span>EVOTAVERN — DIGITAL AFTERLIFE</span><span>THE CONVERSATION CONTINUES.</span></footer>
    <dialog className="status-drawer" ref={drawer} aria-label="对话与设备状态"><button className="dialog-close" onClick={() => drawer.current.close()} aria-label="关闭状态"><Icon name="close" /></button><StatusPanel chat={chat} service={service} /></dialog>
    <dialog className="new-letter-dialog" ref={newDialog} aria-labelledby="new-letter-title" onCancel={event => { if (chat.creating) event.preventDefault(); }}><p className="eyebrow">TURN A NEW PAGE</p><h2 id="new-letter-title">翻开新的一页？</h2><p>当前页面会切换到新的对话，未发送的草稿将清空。需要保留这次来信的话，可以先导出文字。</p>{newError && <p className="form-error" role="alert">{chat.error || '服务暂时不可用，尚未切换会话。'}</p>}<div className="dialog-actions"><button className="button button-quiet" onClick={() => newDialog.current.close()} disabled={chat.creating}>留在这一页</button><button className="button button-blue" onClick={createNew} disabled={chat.creating}>{chat.creating ? '正在打开…' : '开始新对话'}<Icon name="arrow" /></button></div></dialog>
  </div>;
}
