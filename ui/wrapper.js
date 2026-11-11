(async () => {
  await magpie.ready;
  const options = await magpie.options.get();
  const port = options.port ?? 52408;
  // Magpie's page CSP forbids nested frames and fetch. Navigate the same
  // sandboxed frame to its declared local service, retaining its parent bridge.
  location.replace(magpie.service || `http://127.0.0.1:${port}/`);
})().catch(error => { document.getElementById('note').textContent = error.message; });
