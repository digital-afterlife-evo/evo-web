export const RECORDING_LIMIT_MS = 60000;
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const formats = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'];

const messages = {
  MICROPHONE_UNSUPPORTED: '当前浏览器不支持录音，请使用新版 Chrome 或 Edge，或继续输入文字。',
  MICROPHONE_INSECURE: '录音需要 HTTPS 或 localhost，请通过安全地址打开网页。',
  NotAllowedError: '没有获得麦克风权限，你仍然可以输入文字。',
  NotFoundError: '没有找到可用的麦克风，请检查设备连接。',
  NotReadableError: '麦克风无法使用，请检查是否被其他程序占用。',
  MICROPHONE_LOST: '麦克风已断开，请检查设备后重新录音。',
  RECORDING_FAILED: '录音未完成，请重试。原有文字已保留。',
  ASR_EMPTY_AUDIO: '没有录到有效音频，请再试一次。',
  ASR_NO_SPEECH: '没有识别到说话内容，请再试一次。',
  ASR_AUDIO_TOO_LARGE: '录音文件太大，请缩短录音后重试。',
  ASR_UNSUPPORTED_FORMAT: '当前录音格式暂不支持，请使用新版 Chrome 或 Edge。',
  ASR_INVALID_AUDIO: '录音文件不完整，请重新录音。',
  ASR_NOT_CONFIGURED: '语音识别服务尚未配置，你仍然可以输入文字。',
  ASR_AUTH_FAILED: '语音识别服务暂时无法使用，请检查服务配置。',
  ASR_RATE_LIMITED: '语音识别服务繁忙，请稍后重试。',
  ASR_BUSY: '已有录音正在转写，请稍后重试。',
  ASR_TIMEOUT: '语音转写超时，请重试。原有文字已保留。',
  TimeoutError: '语音转写超时，请重试。原有文字已保留。',
  AGENT_BUSY: '当前回复完成后，再开始语音输入。',
  BACKEND_NOT_CONFIGURED: '语音服务尚未连接，你仍然可以输入文字。',
};

export function speechError(error) {
  return messages[error.code] || messages[error.name] || '语音转写失败，请重试。原有文字已保留。';
}

function failure(code) { return Object.assign(new Error(code), { code }); }

export function appendTranscript(draft, text) {
  const transcription = text.trim();
  if (!transcription) return draft;
  return draft ? draft + (/\s$/.test(draft) ? '' : '\n') + transcription : transcription;
}

// Record locally; only an explicit stop (or the 60-second limit) produces an uploadable blob.
export async function recordAudio(signal, onStarted) {
  signal.throwIfAborted();
  if (globalThis.isSecureContext === false) throw failure('MICROPHONE_INSECURE');
  if (!globalThis.navigator?.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw failure('MICROPHONE_UNSUPPORTED');
  const mimeType = formats.find(format => MediaRecorder.isTypeSupported(format));
  if (!mimeType) throw failure('ASR_UNSUPPORTED_FORMAT');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  let recorder, timer, abort, ended;
  let intentionalStop = false;
  const release = () => stream.getTracks().forEach(track => track.stop());
  try {
    signal.throwIfAborted();
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
    return await new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      const stop = () => {
        intentionalStop = true;
        if (recorder.state !== 'inactive') recorder.stop();
        release();
      };
      abort = () => { intentionalStop = true; reject(signal.reason); };
      ended = () => { if (!intentionalStop) reject(failure('MICROPHONE_LOST')); };
      signal.addEventListener('abort', abort, { once: true });
      for (const track of stream.getTracks()) track.addEventListener('ended', ended);
      recorder.ondataavailable = event => {
        if (!event.data.size) return;
        size += event.data.size;
        if (size > MAX_AUDIO_BYTES) { reject(failure('ASR_AUDIO_TOO_LARGE')); return; }
        chunks.push(event.data);
      };
      recorder.onerror = () => reject(failure('RECORDING_FAILED'));
      recorder.onstart = () => {
        timer = setTimeout(stop, RECORDING_LIMIT_MS);
        onStarted(stop);
      };
      recorder.onstop = () => size ? resolve(new Blob(chunks, { type: recorder.mimeType || mimeType })) : reject(failure('ASR_EMPTY_AUDIO'));
      recorder.start(1000);
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    for (const track of stream.getTracks()) if (ended) track.removeEventListener('ended', ended);
    if (recorder) {
      recorder.onstart = null; recorder.onstop = null; recorder.onerror = null; recorder.ondataavailable = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    release();
  }
}

export async function transcribeRecording(audio, signal) {
  const response = await fetch('/api/v1/audio/transcriptions', {
    method: 'POST', headers: { 'Content-Type': audio.type }, body: audio,
    signal: AbortSignal.any([signal, AbortSignal.timeout(130000)]),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw failure(result.error?.code || 'ASR_UNAVAILABLE');
  if (typeof result.text !== 'string' || !result.text.trim()) throw failure('ASR_NO_SPEECH');
  return result.text;
}
