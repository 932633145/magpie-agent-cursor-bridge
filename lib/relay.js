import net from 'node:net';

// Cursor caches the proxy address from settings.json and keeps dialing it long
// after the bridge has restarted on a new port; its agent-store-sync then fails
// with "Failed to establish a socket connection to proxies" and retries on a
// backoff, which is what makes the model list appear late. The engine takes an
// ephemeral port on every start, so the bridge publishes a stable port instead
// and forwards to whatever port the engine holds right now. A restart then
// changes nothing Cursor can see.

export function createRelay(upstreamPort, {port = 0, host = '127.0.0.1'} = {}) {
  const server = net.createServer(socket => {
    // A proxy connection is idle while Cursor waits for a long stream; without
    // this a half-open peer would keep the socket forever.
    socket.setNoDelay(true);
    socket.on('error', () => {});
    const target = net.connect({host, port: upstreamPort()});
    target.setNoDelay(true);
    target.on('error', () => socket.destroy());
    socket.on('close', () => target.destroy());
    target.on('close', () => socket.destroy());
    socket.pipe(target);
    target.pipe(socket);
  });
  return {
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      // 0 lets the OS choose, which is what a caller that only needs a working
      // relay wants; a fixed port is what a caller that wants stability wants.
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        resolve(server.address().port);
      });
    }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

// Bind the port Cursor was told to use. Asking "is this port free?" first is a
// race: after a watchdog restart the previous supervisor's socket can still be
// closing, the probe says busy, and the bridge would publish a new address --
// exactly the churn the fixed port exists to prevent. Binding is the only
// atomic test, so retry it briefly before giving up on the preferred port.
export async function listenFixed(upstreamPort, preferred, {host = '127.0.0.1', attempts = 12, delay = 250} = {}) {
  if (preferred) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const relay = createRelay(upstreamPort, {port: preferred, host});
      try {
        const port = await relay.listen();
        return {relay, port, fixed: port === preferred};
      } catch {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  const relay = createRelay(upstreamPort, {port: 0, host});
  return {relay, port: await relay.listen(), fixed: false};
}

// Whether a fixed relay port is still worth publishing: a port already taken by
// something else means the caller must fall back to an ephemeral one.
export function available(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, host);
  });
}

