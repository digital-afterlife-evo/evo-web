import { useEffect, useRef, useState } from 'react';
import { recordAudio, speechError, transcribeRecording } from './speech';

export function useSpeech(onTranscript) {
  const [phase, setPhase] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const current = useRef(null);
  const receive = useRef(onTranscript);
  receive.current = onTranscript;

  function cancel() {
    const recording = current.current;
    current.current = null;
    recording?.controller.abort();
    clearInterval(recording?.clock);
    setPhase('idle'); setSeconds(0); setNotice(null);
  }

  useEffect(() => {
    const leave = () => {
      const recording = current.current;
      current.current = null;
      recording?.controller.abort(); clearInterval(recording?.clock);
    };
    // pagehide also runs when the browser puts this document in its back/forward cache.
    const resume = () => { if (!current.current) { setPhase('idle'); setSeconds(0); } };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', resume);
    return () => { window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', resume); leave(); };
  }, []);

  async function start() {
    if (current.current) return;
    const recording = { controller: new AbortController(), stop: null, clock: null };
    current.current = recording;
    setPhase('requesting'); setSeconds(0); setError(null); setNotice(null);
    try {
      const audio = await recordAudio(recording.controller.signal, stop => {
        if (current.current !== recording) return;
        recording.stop = stop;
        const startedAt = Date.now();
        setPhase('recording');
        recording.clock = setInterval(() => setSeconds(Math.min(60, Math.floor((Date.now() - startedAt) / 1000))), 250);
      });
      clearInterval(recording.clock);
      if (current.current !== recording) return;
      setPhase('transcribing');
      const text = await transcribeRecording(audio, recording.controller.signal);
      if (current.current !== recording) return;
      receive.current(text);
      setNotice('转写已加入输入框，请确认后发送。');
    } catch (error) {
      if (current.current === recording && !recording.controller.signal.aborted) setError(speechError(error));
    } finally {
      clearInterval(recording.clock);
      if (current.current === recording) { current.current = null; setPhase('idle'); }
    }
  }

  return { phase, seconds, error, notice, busy: phase !== 'idle', start, stop() { current.current?.stop?.(); }, cancel };
}
