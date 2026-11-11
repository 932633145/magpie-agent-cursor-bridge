(async () => {
  await magpie.ready;
  const options = await magpie.options.get();
  const port = options.port ?? 52408;
  // Magpie's page CSP forbids nested frames and fetch. Navigate the same
  // sandboxed frame to its declared local service, retaining its parent bridge.
  const destination = new URL(magpie.service || `http://127.0.0.1:${port}/`, location.href);
  destination.hash = new URLSearchParams({entry: location.href}).toString();
  location.replace(destination.href);
})().catch(error => { document.getElementById('note').textContent = error.message; });
