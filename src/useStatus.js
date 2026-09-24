import { useEffect, useState } from 'react';
import { api } from './chat';

export function useStatus(enabled) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [recovering, setRecovering] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let disposed = false, stream, sequence = -1, lastState = '';
    setLoading(true); setError(false);
    (async () => {
      try {
        const snapshot = await api('/status');
        if (disposed) return;
        setStatus(snapshot);
        const deviceId = snapshot.device?.device_id;
        if (!deviceId || !/^[a-zA-Z0-9_-]{1,128}$/.test(deviceId)) return;
        stream = new EventSource(`/api/v1/devices/${deviceId}/events`);
        stream.onopen = () => { console.info('[web.device.sse_connected]', { device_id: deviceId }); if (!disposed) setError(false); };
        stream.onerror = () => { console.warn('[web.device.sse_reconnecting]', { device_id: deviceId, ready_state: stream.readyState }); if (!disposed) setError(true); };
        for (const type of ['snapshot', 'device.updated']) stream.addEventListener(type, message => {
          if (disposed) return;
          let event;
          try { event = JSON.parse(message.data); } catch { return; }
          if (event.device_id !== deviceId) return;
          if (type === 'snapshot') sequence = -1;
          if (event.sequence <= sequence) return;
          sequence = event.sequence;
          const queue = event.data.print_queue;
          const key = JSON.stringify([event.data.connection, queue?.state, queue?.current_job?.id, queue?.pending_turns]);
          if (key !== lastState) {
            lastState = key;
            console.info('[web.device.state]', { device_id: deviceId, connection: event.data.connection, queue_state: queue?.state, job_id: queue?.current_job?.id, pending_turns: queue?.pending_turns, board_error: event.data.board?.error });
          }
          setStatus(current => current ? { ...current, device: event.data } : current);
        });
      } catch { if (!disposed) setError(true); }
      finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; stream?.close(); };
  }, [enabled, attempt]);
  async function resolvePrint(jobId, action) {
    if (resolving || !status?.device?.device_id) return;
    setResolving(true); setResolveError('');
    console.info('[web.print.resolve]', { job_id: jobId, action });
    try {
      await api(`/devices/${status.device.device_id}/print-jobs/${jobId}/resolve`, { action });
    } catch (error) {
      setResolveError(error.code === 'PRINT_STATE_CHANGED' ? '任务状态已变化，正在刷新。' : '暂未确认操作结果，正在刷新状态；请核对后再操作。');
    } finally {
      setResolving(false); setAttempt(value => value + 1);
    }
  }
  async function recoverDevice() {
    if (recovering || !status?.device?.device_id) return;
    setRecovering(true); setRecoveryNotice('');
    try {
      await api(`/devices/${status.device.device_id}/recover`, {});
      setRecoveryNotice('已请求恢复，正在同步设备状态。');
    } catch (error) {
      setRecoveryNotice(error.status === 404 ? '请重启后端 start.cmd，加载恢复接口。'
        : error.code === 'BOARD_HOST_UPDATE_REQUIRED' ? '请重启 board/start.cmd，加载安全恢复功能。'
          : error.code === 'BOARD_NOT_FAULTED' ? '当前设备不满足恢复条件，正在刷新状态。'
            : '恢复暂未确认，请检查上位机和 USB 连接，再查看最新状态。');
    } finally { setRecovering(false); setAttempt(value => value + 1); }
  }
  return { status, error, loading, resolving, resolveError, resolvePrint, recovering, recoveryNotice, recoverDevice, refresh() { setAttempt(value => value + 1); } };
}
