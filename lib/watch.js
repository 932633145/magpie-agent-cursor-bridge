// A hard kill never runs the supervisor's exit hook, so Cursor keeps a proxy
// port that nothing is listening on. The watchdog relaunches only a supervisor
// that died while it was supposed to be serving. A clean stop, or the user
// turning the agent off, must stay down.

export function shouldRevive(status, now = Date.now(), limit = 20000) {
  if (!status || typeof status !== 'object') return true;
  if (status.state === 'stopped' || status.state === 'disconnected') return false;
  // A replacement that has not published a heartbeat yet still counts as alive.
  // Relaunching on the lock alone starts a second supervisor, and the two then
  // take turns rewriting Cursor's proxy port.
  const beat = Number(status.heartbeat);
  if (Number.isFinite(beat) && now - beat < limit) return false;
  return status.state === 'connected' || status.state === 'starting' || status.state === 'paused' || status.state === 'error';
}
