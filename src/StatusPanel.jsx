import { activeActivity } from './chat';

const printStates = {
  idle: '暂无待打印内容', translating: '正在翻译成英文', retrying: '翻译暂未成功，正在自动重试',
  waiting_reply: '等待这一轮的完整回复', waiting_device: '内容已保存，等待打字机连接',
  waiting_capabilities: '等待设备提供兼容的打印能力与完成回执', queued: '已排队，等待设备领取',
  waiting_receipt: '已交给设备，等待打印回执', printing: '正在打印', needs_confirmation: '打印结果待确认，队列已暂停',
  error: '打印队列暂不可用，请检查后端服务',
};

export default function StatusPanel({ chat, service }) {
  const device = service.status?.device;
  const activity = activeActivity(chat.activities);
  const board = device?.board;
  const faulted = device?.board?.websocket_connected && device?.board?.host_state === 'fault';
  const connected = device?.connection === 'connected' && !service.error && !faulted;
  const queue = device?.print_queue;
  const uncertain = queue?.state === 'needs_confirmation' ? queue.current_job : null;
  function resolve(action) {
    const message = action === 'retry' ? '这一块可能已经打印过。重新打印会从该块开头开始，可能重复落纸。确认重新打印？' : '请先核对纸面：这一块是否已经完整打印？确认后将继续后续内容。';
    if (window.confirm(message)) service.resolvePrint(uncertain.id, action);
  }
  function recover() {
    if (window.confirm('请先确认打字机已切到 Online、纸张已装好且没有卡纸。恢复后可能继续打印排队内容；结果不明的任务仍需单独核对。确认恢复？')) service.recoverDevice();
  }
  return <div className="status-panel">
    <div className="panel-heading"><span className="eyebrow">THE OTHER SIDE</span></div>
    <section className="device-observation">
      <div className="device-illustration" aria-hidden="true"><img src="/design/typewriter.webp" alt="" width="1313" height="1011" /></div>
      <h2>另一端的打字机</h2>
      <p className="connection-state"><span className={`status-dot ${connected ? 'is-connected' : ''}`} />{service.loading ? '正在连接服务' : service.error ? '连接状态暂不可用' : faulted ? '打字机接口故障，外接键盘已暂停' : connected ? '设备已连接' : '实体设备未连接'}</p>
      <button className="quiet-link" onClick={service.refresh} disabled={service.loading}>检查连接</button>
      {faulted && !service.error && <button className="quiet-link" style={{ marginLeft: 18 }} onClick={recover} disabled={service.recovering}>{service.recovering ? '正在请求恢复…' : '恢复打字机'}</button>}
      {board && <details className="activity-history"><summary>连接诊断</summary>
        <p className="print-detail">上位机 HTTP：{board.host_connected === undefined ? '需重启后端更新诊断' : board.host_connected ? '已连接' : '不可达，请启动 board/start.cmd'}</p>
        <p className="print-detail">WebSocket：{board.websocket_connected ? '已连接' : '未连接，请检查上位机 8766 端口'}</p>
        <p className="print-detail">串口：{board.port || '未获取'} · {board.serial_connected ? '已打开' : '未确认，请检查 USB 与串口号'}</p>
        <p className="print-detail">ESP32：{board.device_name || '未识别'} · 状态 {board.host_state}{board.device_seen_at ? ` · 最近通信 ${new Date(board.device_seen_at).toLocaleTimeString()}` : ''}</p>
        {board.device_error && <p className="print-detail">设备错误：{board.device_error}</p>}
        {board.error && <p className="print-detail">连接诊断码：{board.error}</p>}
      </details>}
      {service.recoveryNotice && <p className="print-detail" role="status">{service.recoveryNotice}</p>}
    </section>
    <section className="current-observation"><div className="panel-section-title"><h3>此刻的对话</h3><span>LIVE</span></div><p className="current-action">{chat.connectionError ? '连接暂时中断，回复状态待确认' : chat.creating ? '正在翻开新的一页' : chat.loading ? '正在恢复对话' : activity?.summary || (chat.activeRequest ? '正在组织回答' : chat.problem ? '本轮对话未完成' : '等待你的下一句话')}</p>
      {!!chat.activities.length && <details className="activity-history"><summary>查看本轮过程 <span aria-hidden="true">＋</span></summary><ol>{chat.activities.slice(-12).map(item => <li key={item.id}><span className={`activity-marker ${item.activity_status}`} /><div><p>{item.summary}</p><span>{item.activity_status === 'running' ? '进行中' : item.activity_status === 'failed' ? '未完成' : '已完成'}</span></div></li>)}</ol></details>}
    </section>
    {queue && <section className="print-status" aria-label="英文翻译与打印">
      <div className="panel-section-title"><h3>英文打印</h3><span>{queue.pending_turns} 轮待打印</span></div>
      <p className="current-action" role="status">{service.error ? '连接中断，打印状态待同步' : faulted ? '打字机故障，打印已暂停' : printStates[queue.state] || '正在同步打印状态'}</p>
      {queue.confirmation === 'software_drain' && <p className="print-detail">按设备队列排空继续交付，纸面结果请现场核对。</p>}
      {!service.error && queue.head && <p className="print-detail">第 {queue.head.turn_number} 轮 · {queue.head.role === 'you' ? 'YOU' : 'THEM'}{queue.current_job ? ` · 第 ${queue.current_job.part_index}/${queue.current_job.part_count} 块` : ''}</p>}
      {!service.error && queue.translation?.state === 'retrying' && <p className="print-detail">已尝试 {queue.translation.attempts} 次，将持续重试。你可以继续对话。</p>}
      {uncertain && <details className="print-resolution"><summary>核对打印结果</summary><p>请核对第 {uncertain.turn_number} 轮 {uncertain.role === 'you' ? 'YOU' : 'THEM'} 的第 {uncertain.part_index}/{uncertain.part_count} 块。</p><div><button disabled={service.error || service.resolving} onClick={() => resolve('confirm_completed')}>已完整打印</button><button disabled={service.error || service.resolving} onClick={() => resolve('retry')}>重新打印此块</button></div></details>}
      {service.resolveError && <p className="print-detail" role="alert">{service.resolveError}</p>}
    </section>}
  </div>;
}
