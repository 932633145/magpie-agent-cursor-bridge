import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const ui = fileURLToPath(new URL('../ui/', import.meta.url));
function jsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// This service only reads public status/catalogue and serves packaged UI assets.
// Preference writes go through Magpie's authenticated options.set, never HTTP.
export function pageService(root, port) {
  const server = http.createServer((request, response) => {
    const host = `127.0.0.1:${server.address().port}`;
    if (request.headers.host !== host || (request.headers.origin && request.headers.origin !== 'null')) {
      response.writeHead(403).end(); return;
    }
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Access-Control-Allow-Origin', 'null');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' http://" + host + "; style-src 'self' http://" + host + "; connect-src 'self' http://" + host + "; frame-ancestors *; base-uri 'none'");
    try {
      if (request.url === '/api/state') {
        const connection = jsonFile(path.join(root, 'effective.json')) || jsonFile(path.join(root, 'connection.json'));
        const status = jsonFile(path.join(root, 'status.json'));
        const engine = jsonFile(path.join(root, 'data/roles-status.json'));
        const state = {models: (connection?.models || []).map(m => ({id: m.id, name: m.name || m.id})),
          mainModel: connection?.model || '', bridge: status ? {state: status.state, version: status.version, heartbeat: status.heartbeat} : null,
          applied: engine && status?.state === 'connected' ? engine : null};
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(state)); return;
      }
      const asset = {'/': ['settings.html', 'text/html'], '/settings.js': ['settings.js', 'text/javascript'], '/settings.css': ['settings.css', 'text/css']}[request.url];
      if (!asset) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', asset[1] + '; charset=utf-8');
      response.end(fs.readFileSync(path.join(ui, asset[0])));
    } catch {
      response.writeHead(503, {'Content-Type': 'application/json'}).end('{"error":"Bridge state unavailable; try again"}');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server); });
  });
}
