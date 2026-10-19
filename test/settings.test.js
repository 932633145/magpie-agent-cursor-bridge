import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyProxy,restoreProxy,document,clearStaleProxy} from '../lib/settings.js';
const setup=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cursor-bridge-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return [path.join(dir,'settings.json'),path.join(dir,'undo.json')];};
test('connect/disconnect restores typed settings, noProxy and comments',t=>{
 const [s,j]=setup(t);fs.writeFileSync(s,'{\n // my settings\n "http.noProxy": ["localhost"],\n "http.proxySupport":"override",\n "editor.fontSize":16,\n}\n');
 const original=document(s).data;
 applyProxy(s,j,'http://127.0.0.1:1234');assert.equal(document(s).data['http.proxy'],'http://127.0.0.1:1234');
 applyProxy(s,j,'http://127.0.0.1:4567');
 assert.deepEqual(restoreProxy(j),[]);assert.deepEqual(document(s).data,original);assert.match(fs.readFileSync(s,'utf8'),/my settings/);
});
test('disconnect preserves user edits made while connected',t=>{
 const [s,j]=setup(t);fs.writeFileSync(s,'{"editor.fontSize":16}');applyProxy(s,j,'http://127.0.0.1:1234');
 const data=document(s).data;data['http.proxy']='http://localhost:8888';data['editor.fontSize']=20;fs.writeFileSync(s,JSON.stringify(data));
 assert.deepEqual(restoreProxy(j),['http.proxy']);assert.deepEqual(document(s).data,{'editor.fontSize':20,'http.proxy':'http://localhost:8888'});
});
test('external proxy change is not silently overwritten',t=>{
 const [s,j]=setup(t);applyProxy(s,j,'http://127.0.0.1:1234');const data=document(s).data;data['http.proxy']='http://localhost:8888';fs.writeFileSync(s,JSON.stringify(data));
 assert.throws(()=>applyProxy(s,j,'http://127.0.0.1:1234'),/externally/);assert.equal(document(s).data['http.proxy'],'http://localhost:8888');
});
test('malformed settings stay intact and retain crash recovery journal',t=>{
 const [s,j]=setup(t);applyProxy(s,j,'http://127.0.0.1:1234');fs.writeFileSync(s,'{"broken"');
 assert.throws(()=>restoreProxy(j),/invalid/);assert.ok(fs.existsSync(j));assert.equal(fs.readFileSync(s,'utf8'),'{"broken"');
});
test('recovery is idempotent',t=>{const [s,j]=setup(t);applyProxy(s,j,'http://127.0.0.1:1234');restoreProxy(j);assert.deepEqual(restoreProxy(j),[]);});

test('a bridge proxy with no journal is still removed on disconnect',t=>{
  // Turning the agent off must give Cursor its own model list back. Without
  // this, a crash or a paused reclaim left the proxy keys pointing at a closed
  // port, and Cursor kept the Magpie catalogue while being unable to reach it.
  const [s,j]=setup(t);
  fs.writeFileSync(s,JSON.stringify({'window.autoDetectColorScheme':true,'editor.fontSize':15}));
  applyProxy(s,j,'http://127.0.0.1:1234');
  assert.equal(document(s).data['http.proxy'],'http://127.0.0.1:1234');
  fs.unlinkSync(j); // the journal is gone, as after a hard kill
  const removed=clearStaleProxy(s);
  assert.ok(removed.includes('http.proxy'));
  assert.deepEqual(document(s).data,{'window.autoDetectColorScheme':true,'editor.fontSize':15});
});

test('a proxy the user configured by hand is never removed',t=>{
  const [s]=setup(t);
  fs.writeFileSync(s,JSON.stringify({'http.proxy':'http://corp-proxy:8080','editor.fontSize':14}));
  assert.deepEqual(clearStaleProxy(s),[]);
  assert.equal(document(s).data['http.proxy'],'http://corp-proxy:8080');
});
