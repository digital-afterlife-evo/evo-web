import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendTranscript, recordAudio, speechError, transcribeRecording, RECORDING_LIMIT_MS } from '../src/speech.js';

function fakeMicrophone(t, getUserMedia) {
  const previous = Object.fromEntries(['navigator', 'MediaRecorder', 'isSecureContext'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const track = new EventTarget(); track.stopped = false; track.stop = () => { track.stopped = true; };
  const stream = { getTracks: () => [track] };
  let instance;
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(_, options) { this.mimeType = options.mimeType; this.state = 'inactive'; instance = this; }
    start() { this.state = 'recording'; queueMicrotask(() => this.onstart?.()); }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['recorded audio'], { type: this.mimeType }) }); this.onstop?.(); });
    }
  }
  for (const [name, value] of Object.entries({
    navigator: { mediaDevices: { getUserMedia: getUserMedia || (async () => stream) } },
    MediaRecorder: Recorder, isSecureContext: true,
  })) Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  });
  return { track, stream, get recorder() { return instance; } };
}

test('stopping recording returns audio and immediately releases the microphone', async t => {
  const mic = fakeMicrophone(t);
  let stop;
  const started = new Promise(resolve => {
    mic.recording = recordAudio(new AbortController().signal, finish => { stop = finish; resolve(); });
  });
  await started;
  assert.equal(mic.track.stopped, false);
  stop();
  assert.equal(mic.track.stopped, true);
  const blob = await mic.recording;
  assert.equal(blob.type, 'audio/webm;codecs=opus');
  assert.equal(await blob.text(), 'recorded audio');
});

test('cancel during permission prompt discards late microphone access and produces no recording', async t => {
  let grant;
  const mic = fakeMicrophone(t, () => new Promise(resolve => { grant = resolve; }));
  const controller = new AbortController();
  const recording = recordAudio(controller.signal, () => assert.fail('Recording must not start'));
  controller.abort(); grant(mic.stream);
  await assert.rejects(recording, { name: 'AbortError' });
  assert.equal(mic.track.stopped, true);
  assert.equal(mic.recorder, undefined);
});

test('cancel active recording never returns a blob', async t => {
  const mic = fakeMicrophone(t);
  const controller = new AbortController();
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const recording = recordAudio(controller.signal, started);
  await ready; controller.abort();
  await assert.rejects(recording, { name: 'AbortError' });
  assert.equal(mic.track.stopped, true);
  assert.equal(mic.recorder.state, 'inactive');
});

test('recording automatically stops after sixty seconds', async t => {
  const mic = fakeMicrophone(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const recording = recordAudio(new AbortController().signal, started);
  await ready;
  t.mock.timers.tick(RECORDING_LIMIT_MS);
  assert.ok((await recording).size);
  assert.equal(mic.track.stopped, true);
});

test('permission rejection and microphone loss report useful errors without keeping capture active', async t => {
  await t.test('permission denied', async t => {
    fakeMicrophone(t, async () => { throw new DOMException('Denied', 'NotAllowedError'); });
    await assert.rejects(recordAudio(new AbortController().signal, () => {}), error => speechError(error).includes('权限'));
  });
  await t.test('microphone disconnected', async t => {
    const mic = fakeMicrophone(t);
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const recording = recordAudio(new AbortController().signal, started);
    await ready;
    mic.track.dispatchEvent(new Event('ended'));
    await assert.rejects(recording, { code: 'MICROPHONE_LOST' });
    assert.equal(mic.track.stopped, true);
  });
});

test('ASR upload carries only audio, returns editable text and preserves the existing draft', async t => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  let called = 0;
  globalThis.fetch = async (url, options) => {
    called++;
    assert.equal(url, '/api/v1/audio/transcriptions');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'audio/webm');
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(options.body instanceof Blob);
    return Response.json({ text: '语音转写。' });
  };
  const text = await transcribeRecording(new Blob(['audio'], { type: 'audio/webm' }), new AbortController().signal);
  assert.equal(appendTranscript('已有草稿', text), '已有草稿\n语音转写。');
  assert.equal(appendTranscript('已有草稿\n', text), '已有草稿\n语音转写。');
  assert.equal(appendTranscript('保留原文', '  '), '保留原文');
  assert.ok(appendTranscript('字'.repeat(8000), text).length > 8000);
  assert.equal(called, 1); // No automatic conversation submission.
});

test('empty transcription and upstream failure do not return replacement draft text', async t => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async () => Response.json({ text: ' ' });
  await assert.rejects(transcribeRecording(new Blob(), new AbortController().signal), { code: 'ASR_NO_SPEECH' });
  globalThis.fetch = async () => Response.json({ error: { code: 'ASR_AUTH_FAILED', message: 'private key' } }, { status: 502 });
  await assert.rejects(transcribeRecording(new Blob(), new AbortController().signal), error => {
    assert.doesNotMatch(speechError(error), /private key/);
    return error.code === 'ASR_AUTH_FAILED';
  });
});
