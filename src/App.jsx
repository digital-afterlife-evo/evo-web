import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import Landing from './Landing';
import Conversation from './Conversation';
import { useConversation } from './useConversation';
import { useSpeech } from './useSpeech';
import { useStatus } from './useStatus';
import { appendTranscript } from './speech';

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  const inRoom = hash === '#conversation';
  const [draft, setDraft] = useState(() => { try { return sessionStorage.getItem('digital-afterlife.draft') || ''; } catch { return ''; } });
  const chat = useConversation(inRoom);
  const service = useStatus(inRoom);
  const speech = useSpeech(text => setDraft(current => appendTranscript(current, text)));

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener('hashchange', sync); window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);
  useEffect(() => { try { sessionStorage.setItem('digital-afterlife.draft', draft); } catch { /* Private browsing may disable storage. */ } }, [draft]);
  useEffect(() => {
    if (!inRoom) speech.cancel();
    const frame = requestAnimationFrame(() => {
      if (hash === '#about' || hash === '#typewriter') document.querySelector(hash)?.scrollIntoView({ behavior: 'auto' });
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  function navigate(next) {
    if (next === window.location.hash) {
      const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      if (next === '#about' || next === '#typewriter') document.querySelector(next)?.scrollIntoView({ behavior });
      else if (!next) window.scrollTo({ top: 0, behavior });
      return;
    }
    if (next !== '#conversation') speech.cancel();
    const change = () => {
      history.pushState(null, '', next || window.location.pathname + window.location.search);
      flushSync(() => setHash(next));
    };
    if ((next === '#conversation') !== inRoom && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(change);
    } else change();
  }

  function voice() {
    if (chat.busy || speech.busy) return;
    // Commit the scene before requesting capture, within the user's explicit click.
    if (!inRoom) { history.pushState(null, '', '#conversation'); flushSync(() => setHash('#conversation')); }
    speech.start();
  }

  return <>
    <a href={inRoom ? '#message' : '#about'} className="skip-link" onClick={event => { if (inRoom) { event.preventDefault(); document.getElementById('message')?.focus(); } }}>跳到主要内容</a>
    {inRoom
      ? <Conversation chat={chat} speech={speech} service={service} draft={draft} setDraft={setDraft} navigate={navigate} startVoice={voice} />
      : <Landing navigate={navigate} continueSession={!!chat.sessionId} voice={voice} />}
  </>;
}
