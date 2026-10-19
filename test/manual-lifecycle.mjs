// Explicit live integration test: requires the installed Magpie connection and trusted CA.
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cursor-bridge-lifecycle-'));const settings=path.join(root,'settings.json');const original='{\n // unchanged settings\n "editor.fontSize":17, "http.proxy":"http://localhost:8888"\n}\n';
fs.writeFileSync(settings,original);fs.mkdirSync(path.join(root,'data/ca'),{recursive:true});for(const n of ['ca.key','ca.crt'])fs.copyFileSync(path.join(os.homedir(),'.config/magpie-cursor-bridge/data/ca',n),path.join(root,'data/ca',n));
const c=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/magpie-cursor-bridge/connection.json')));
const config=path.join(root,'connection.json');const write=c=>fs.writeFileSync(config,JSON.stringify(c),{mode:0o600});write({});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let child;
const start=()=>{child=spawn(process.execPath,[fileURLToPath(new URL('../bridge.js',import.meta.url)),'supervise'],{env:{...process.env,CURSOR_BRIDGE_ROOT:root,CURSOR_BRIDGE_SETTINGS:settings,CURSOR_BRIDGE_NO_WATCHDOG:'1'},stdio:['ignore','ignore','pipe']});child.stderr.on('data',d=>process.stderr.write(d));};
async function until(fn,label){for(let i=0;i<60;i++){try{const v=fn();if(v)return v;}catch{}await delay(500);}throw new Error('timeout '+label+' '+JSON.stringify(state()));}
const state=()=>JSON.parse(fs.readFileSync(path.join(root,'status.json')));
try {
 start();await until(()=>state().state==='disconnected','idle');assert.equal(fs.readFileSync(settings,'utf8'),original);
 write(c);await until(()=>state().state==='connected','connect');const first=state();assert.ok(first.models>0);assert.notEqual(fs.readFileSync(settings,'utf8'),original);
 const alternate=c.models.find(m=>m.id!==c.model).id;write({...c,model:alternate});await until(()=>state().model===alternate,'model switch');assert.equal(state().pid,first.pid);assert.equal(state().proxy,first.proxy);console.log('PASS: model switch reloads without restarting native proxy');
 write({});await until(()=>state().state==='disconnected','disconnect');assert.equal(fs.readFileSync(settings,'utf8'),original);console.log('PASS: native start, model sync, disconnect, exact settings restoration');
 write(c);await until(()=>state().state==='connected','reconnect');
 write({...c,gateway:'http://127.0.0.1:9/v1'});await until(()=>state().state==='error','unavailable gateway');assert.equal(fs.readFileSync(settings,'utf8'),original);console.log('PASS: gateway failure restores proxy');
 write(c);await until(()=>state().state==='connected','gateway restored');const beforeCrash=state();
 child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));await until(()=>{try{process.kill(beforeCrash.pid,0);return false;}catch{return true;}},'orphan shutdown');console.log('PASS: supervisor crash also stops native proxy');
 write({});start();await until(()=>state().state==='disconnected','crash recovery');assert.equal(fs.readFileSync(settings,'utf8'),original);console.log('PASS: restart recovers durable settings journal');
}finally{if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}fs.rmSync(root,{recursive:true,force:true});}
