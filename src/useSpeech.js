import { useEffect, useRef, useState } from 'react';
import { recordAudio, speechError, transcribeRecording } from './speech';

export function useSpeech(onTranscript) {
  const [phase, setPhase] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [levels, setLevels] = useState([]);
  const current = useRef(null);
  const receive = useRef(onTranscript);
  receive.current = onTranscript;
  useEffect(() => { console.info('[web.speech.phase]', { phase }); }, [phase]);

  function cancel() {
    const recording = current.current;
    if (recording) console.info('[web.speech.cancel]');
    current.current = null;
    recording?.controller.abort();
    clearInterval(recording?.clock);
    recording?.stopMeter?.();
    setPhase('idle'); setSeconds(0); setNotice(null); setLevels([]);
  }

  useEffect(() => {
    const leave = () => {
      const recording = current.current;
      current.current = null;
      recording?.controller.abort(); clearInterval(recording?.clock); recording?.stopMeter?.();
    };
    // pagehide also runs when the browser puts this document in its back/forward cache.
    const resume = () => { if (!current.current) { setPhase('idle'); setSeconds(0); } };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', resume);
    return () => { window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', resume); leave(); };
  }, []);

  async function start() {
    if (current.current) return;
    const recording = { controller: new AbortController(), stop: null, clock: null, stopMeter: null };
    current.current = recording;
    setPhase('requesting'); setSeconds(0); setError(null); setNotice(null); setLevels([]);
    try {
      const audio = await recordAudio(recording.controller.signal, (stop, stream) => {
        if (current.current !== recording) return;
        recording.stop = stop;
        const startedAt = Date.now();
        setPhase('recording');
        recording.clock = setInterval(() => setSeconds(Math.min(60, Math.floor((Date.now() - startedAt) / 1000))), 250);
        // Meter the existing stream without connecting it to speakers. ASR does not depend on Web Audio.
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          let context;
          try {
            context = new AudioContext();
            const analyser = context.createAnalyser(); analyser.fftSize = 256;
            const source = context.createMediaStreamSource(stream); source.connect(analyser);
            const samples = new Uint8Array(analyser.frequencyBinCount);
            const meter = setInterval(() => {
              if (current.current !== recording || context.state !== 'running') return;
              analyser.getByteFrequencyData(samples);
              setLevels(Array.from({ length: 9 }, (_, index) => samples[index * 5 + 2] / 255));
            }, 75);
            let stopped = false;
            recording.stopMeter = () => {
              if (stopped) return; stopped = true;
              clearInterval(meter); source.disconnect(); analyser.disconnect(); context.close().catch(() => {});
            };
            context.resume().catch(() => recording.stopMeter());
          } catch { context?.close().catch(() => {}); }
        }
      });
      clearInterval(recording.clock);
      recording.stopMeter?.(); setLevels([]);
      if (current.current !== recording) return;
      setPhase('transcribing');
      console.info('[web.speech.upload]', { bytes: audio.size, mime: audio.type });
      const text = await transcribeRecording(audio, recording.controller.signal);
      if (current.current !== recording) return;
      receive.current(text);
      console.info('[web.speech.completed]', { chars: text.length });
      setNotice('转写已加入输入框，请确认后发送。');
    } catch (error) {
      console.warn('[web.speech.failed]', { code: error.code || error.name, cancelled: recording.controller.signal.aborted });
      if (current.current === recording && !recording.controller.signal.aborted) setError(speechError(error));
    } finally {
      clearInterval(recording.clock);
      recording.stopMeter?.();
      if (current.current === recording) { current.current = null; setPhase('idle'); }
    }
  }

  return { phase, seconds, levels, error, notice, busy: phase !== 'idle', start, stop() { current.current?.stop?.(); }, cancel, clearNotice() { setNotice(null); setError(null); } };
}
