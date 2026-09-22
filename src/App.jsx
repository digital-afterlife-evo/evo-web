import { useEffect, useRef, useState } from 'react';
import { useConversation } from './useConversation';
import { useSpeech } from './useSpeech';
import { appendTranscript } from './speech';

function Microphone() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="12" y="3" width="8" height="17" rx="4" /><path d="M7 14v3a9 9 0 0 0 18 0v-3M16 26v4" /></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 36 32" fill="none" aria-hidden="true"><path d="m3 12 29-9-9 26-8-11-12-6Z" /><path d="M15 18 32 3" /></svg>;
}

function Backdrop() {
  const film = [
    '109.8719 -221.9537 214.7529 106.3074 -163.9423 51.7602',
    '109.8719 -221.9537 214.7529 106.3074 52.4386 161.4745',
    '109.8719 -221.9537 214.7529 106.3074 268.8196 271.1888',
    '109.8719 -221.9537 214.7529 106.3074 485.2006 380.903',
    '109.8719 -221.9537 214.7529 106.3074 270.1873 .5791',
    '109.8719 -221.9537 214.7529 106.3074 485.2006 107.6229',
  ];
  return <div className="backdrop" aria-hidden="true">
    <svg className="collage" viewBox="0 0 612 792" preserveAspectRatio="none">
      <g className="film-frames">{film.map((matrix, i) => <image key={i} href="/design/film.png" width="1" height="1" preserveAspectRatio="none" transform={`matrix(${matrix})`} />)}</g>
      <image href="/design/ribbon.png" width="1" height="1" preserveAspectRatio="none" transform="matrix(370.9997 0 0 367.8662 -91.0608 407.9317)" />
      <image href="/design/ribbon.png" width="1" height="1" preserveAspectRatio="none" transform="matrix(349.0463 -125.7278 124.666 346.0982 -174.6602 405.9785)" />
      <image href="/design/ribbon-alt.png" width="1" height="1" preserveAspectRatio="none" transform="matrix(-171.3194 -329.0751 -326.2958 169.8724 369.7598 875.7058)" />
    </svg>
  </div>;
}

export default function App() {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef(null);
  const transcript = useRef(null);
  const stickToBottom = useRef(true);
  const chat = useConversation(opened);
  const speech = useSpeech(text => {
    setDraft(current => appendTranscript(current, text));
    input.current?.focus();
  });
  const tooLong = draft.length > 8000;
  const cannotSend = chat.busy || speech.busy || tooLong;
  const micLabel = speech.phase === 'recording' ? '停止录音并转写' : speech.phase === 'requesting' ? '等待麦克风权限' : speech.phase === 'transcribing' ? '正在转写' : '开始语音输入';

  useEffect(() => {
    if (opened) input.current?.focus();
  }, [opened]);
  useEffect(() => {
    if (stickToBottom.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [chat.messages, chat.busy, opened]);
  async function send(event) {
    event?.preventDefault();
    if (!opened) { setOpened(true); return; }
    if (cannotSend) return;
    const text = draft;
    stickToBottom.current = true;
    if (await chat.send(text)) setDraft(current => current === text ? '' : current);
  }

  return <main className={`site ${opened ? 'is-conversing' : ''}`}>
    <Backdrop />
    <section className="experience" aria-label="数字余生">
      <div className="toolbar">
        {opened && <button className="back-button" onClick={() => { speech.cancel(); setOpened(false); }} aria-label="返回封面">← <span>返回封面</span></button>}
        <div className="toolbar-actions">
          <button className={`icon-button microphone ${speech.phase === 'recording' ? 'is-recording' : ''}`} aria-label={micLabel} aria-pressed={speech.phase === 'recording'} title={chat.busy ? '当前回复完成后可录音' : micLabel} disabled={speech.phase === 'requesting' || speech.phase === 'transcribing' || (chat.busy && speech.phase !== 'recording')} onClick={() => {
            if (speech.phase === 'recording') speech.stop();
            else { setOpened(true); speech.start(); }
          }}><Microphone /></button>
          <button className="icon-button send" aria-label={opened ? '发送消息' : '开始文字对话'} title={opened ? '发送消息' : '开始文字对话'} disabled={opened && (!draft.trim() || cannotSend)} onClick={send}><SendIcon /></button>
        </div>
        {speech.busy && <div className="microphone-notice" role="status"><span>{speech.phase === 'recording' ? `正在录音 ${String(Math.floor(speech.seconds / 60)).padStart(2, '0')}:${String(speech.seconds % 60).padStart(2, '0')} · 再次点击停止` : speech.phase === 'requesting' ? '等待麦克风权限…' : '正在转写…'}</span><button type="button" onClick={speech.cancel}>取消</button></div>}
      </div>

      <div className="paper">
        <header className="paper-heading">
          <h1><img className="title-art" src="/design/title.svg" alt="数字余生" /></h1>
          <p><img className="tagline-art" src="/design/tagline.svg" alt="Counting the rest of my life" /></p>
        </header>

        {!opened ? <button className="typewriter-entry" onClick={() => setOpened(true)} aria-label="开始文字对话">
          <img className="typewriter" src="/design/typewriter.png" alt="一台复古打字机" />
          <span className="entry-hint">点击打字机，写下第一句话 <span aria-hidden="true">↗</span></span>
        </button> : <div className="conversation">
          <div className="transcript" ref={transcript} role="log" aria-label="对话记录" aria-live="polite" aria-relevant="additions text" onScroll={() => {
            const node = transcript.current;
            stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 70;
          }}>
            {!chat.messages.length && !chat.loading && <div className="empty-conversation">
              <span className="empty-rule" />
              <p>从一句话开始。</p>
              <span>此刻想起了什么，就写下来吧。</span>
              <img src="/design/typewriter.png" alt="" aria-hidden="true" />
            </div>}
            {chat.messages.map(message => <article className={`message message-${message.role}`} key={message.id}>
              <div className="message-author">{message.role === 'user' ? '你' : '数字余生'}<span aria-hidden="true"> / </span></div>
              <p>{message.text}{message.status === 'streaming' && <span className="text-cursor" aria-hidden="true" />}</p>
              {message.status === 'incomplete' && <span className="incomplete-label">回复未完成</span>}
            </article>)}
            {(chat.loading || chat.submitting || (chat.activeRequest && !chat.messages.some(message => message.request_id === chat.activeRequest && message.role === 'assistant'))) && <p className="waiting" role="status">{chat.loading ? '正在载入对话…' : chat.submitting ? '正在发送…' : '正在等待回复…'}</p>}
          </div>
          <form className="composer" onSubmit={send}>
            {speech.error && <div className="conversation-error" role="alert">{speech.error}</div>}
            {speech.notice && !speech.error && <p className="speech-notice" role="status">{speech.notice}</p>}
            {tooLong && <div className="conversation-error" role="alert">合并后的文字超过 8000 字，请删减后发送；转写内容已完整保留。</div>}
            {chat.error && <div className="conversation-error" role="alert"><span>{chat.error}</span>{chat.connectionError && <button type="button" onClick={chat.reconnect}>重新连接</button>}</div>}
            <label className="sr-only" htmlFor="message">写下你想说的话</label>
            <textarea id="message" ref={input} value={draft} onChange={event => setDraft(event.target.value)} maxLength={8000} placeholder="写下你想说的话…" rows="2" disabled={chat.submitting} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(); }
            }} />
            <div className="composer-footer"><span>{speech.busy ? '录音转写后，确认文字再发送' : chat.busy ? '回复完成后，可以继续书写' : 'Enter 发送 · Shift + Enter 换行'}</span><button type="submit" disabled={!draft.trim() || cannotSend}>发送 <span aria-hidden="true">↗</span></button></div>
          </form>
        </div>}
      </div>
    </section>
    <footer className="credits"><img className="team-art" src="/design/credits.svg" alt="Chris Xwen Sidors 两仪黑豆" /><img className="wordmark-art" src="/design/wordmark.svg" alt="EVOTAVERN" /></footer>
  </main>;
}
