// Optional browser integration test: npm-provided Playwright in an isolated tool directory.
// Run: PLAYWRIGHT_REQUIRE_FROM=/path/to/tool/package.json node test/ui-browser.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {pageService} from '../lib/page-service.js';
const require = createRequire(process.env.PLAYWRIGHT_REQUIRE_FROM);
const {chromium, webkit} = require('playwright');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-ui-test-'));
const service = await pageService(root, 0);
const port = service.address().port;
const ui = fileURLToPath(new URL('../ui/', import.meta.url));
let saved = {port, gitModel: 'missing', tabMode: 'forward'}, messages = 0;
fs.writeFileSync(path.join(root, 'connection.json'), JSON.stringify({key:'NEVER_EXPOSE', model:'main', models:[{id:'main', name:'主模型'},{id:'tab',name:'补全模型'}]}));
const shell = http.createServer((request, response) => {
  if (request.url === '/wrapper.js') {response.setHeader('Content-Type','text/javascript'); response.end(fs.readFileSync(path.join(ui,'wrapper.js')));return;}
  if (request.url === '/entry') {
    response.setHeader('Content-Security-Policy', "sandbox allow-scripts; default-src 'none'; script-src http://127.0.0.1:"+shell.address().port+"; connect-src 'none'; frame-src 'none'");
    response.end('<p id="note"></p><script src="wrapper.js"></script>');return;
  }
  response.end('<!doctype html><iframe sandbox="allow-scripts" src="/entry"></iframe>');
});
await new Promise(resolve => shell.listen(0,'127.0.0.1',resolve));
const browserType = process.env.UI_BROWSER === 'webkit' ? webkit : chromium;
let browser;
try {
  browser = await browserType.launch(process.env.UI_BROWSER_EXECUTABLE ? {executablePath:process.env.UI_BROWSER_EXECUTABLE} : {});
  const page = await browser.newPage({viewport:{width:480,height:900}});
  await page.route('**/wrapper.js', async route => {
    // Exact host wrapper contract; the destination page uses real postMessage.
    const bootstrap = `window.magpie={ready:Promise.resolve(),service:'http://127.0.0.1:${port}/',options:{get:async()=>({port:${port}})}};\n`;
    await route.fulfill({contentType:'text/javascript',body:bootstrap+fs.readFileSync(path.join(ui,'wrapper.js'),'utf8')});
  });
  await page.exposeFunction('bridgeOptions', async message => {
    messages++;
    if (message.method === 'options.set') saved = message.params.options;
    return message.method === 'theme' ? {dark:true,tokens:{}} : saved;
  });
  await page.addInitScript(() => {
    if (window === window.top) addEventListener('message', async event => {
      if (event.data?.magpie !== 1) return;
      const result = await window.bridgeOptions(event.data);
      if (event.data.method === 'options.set') window.savedBridgeOptions = result;
      event.source.postMessage({magpie:1,id:event.data.id,result}, '*');
    });
  });
  await page.goto(`http://127.0.0.1:${shell.address().port}/`);
  const frame = page.frameLocator('iframe');
  await frame.locator('#gitModel').waitFor();
  await frame.locator('#gitModel option[value="missing"]').waitFor({state:'attached'});
  assert.match(await frame.locator('#gitModel').textContent(), /不可用/);
  await frame.locator('#gitModel').selectOption('main');
  await frame.locator('#tabMode').selectOption('local');
  await frame.locator('#tabModel').selectOption('tab');
  await frame.locator('#save').click();
  await page.waitForFunction(() => window.savedBridgeOptions?.tabMode === 'local');
  // Saving re-enters the host wrapper, then restores the saved options.
  await frame.locator('#tabMode').filter({has:frame.locator('option:checked[value="local"]')}).waitFor({timeout:12000});
  assert.match(page.frames()[1].url(), /#entry=/);
  assert.equal(saved.port,port);assert.equal(saved.gitModel,'main');assert.equal(saved.tabModel,'tab');assert.equal(saved.tabMode,'local');
  assert.ok(messages>=3);
  assert.equal(await frame.locator('body').evaluate(el=>el.scrollWidth>innerWidth),false);
  console.log('PASS: sandbox navigation, options persistence, missing model, narrow viewport');
} finally {
  await browser?.close(); service.closeAllConnections(); shell.closeAllConnections();
  await Promise.all([new Promise(r=>service.close(r)),new Promise(r=>shell.close(r))]);
  fs.rmSync(root,{recursive:true,force:true});
}
