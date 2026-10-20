#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {atomic,applyProxy,restoreProxy,clearStaleProxy} from './lib/settings.js';
import {validate,gatewayModels} from './lib/config.js';
import {claim,held,release} from './lib/lock.js';
import {readWired, nextMagpieGate} from './lib/magpie.js';
import {shouldRevive} from './lib/watch.js';
import {listenFixed} from './lib/relay.js';

// Cursor caches the proxy address it read from settings.json, so an engine that
// takes a fresh port on every restart leaves Cursor dialing a closed one until it
// notices. Publishing a fixed port from the bridge keeps that address valid
// across restarts, whatever port the engine ends up on.
const relayPort=Number(process.env.CURSOR_BRIDGE_RELAY_PORT)||52407;

const packageDir=path.dirname(fileURLToPath(import.meta.url));
const version=JSON.parse(fs.readFileSync(path.join(packageDir,'package.json'),'utf8')).version;
const root=process.env.CURSOR_BRIDGE_ROOT||path.join(os.homedir(),'.config/magpie-cursor-bridge');
const defaultSettings=process.platform==='win32'
  ? path.join(process.env.APPDATA||path.join(os.homedir(),'AppData/Roaming'),'Cursor/User/settings.json')
  : path.join(os.homedir(),'Library/Application Support/Cursor/User/settings.json');
const settings=process.env.CURSOR_BRIDGE_SETTINGS||defaultSettings;
const engineBinary=path.join(packageDir,'bin',process.platform==='win32'?'cursor-magpie-bridge.exe':'cursor-magpie-bridge');
const file=name=>path.join(root,name);
let lastStatus='',lastWrite=0;
// status.json also carries a heartbeat. A supervisor that dies without a clean
// shutdown cannot rewrite the file, so a stale timestamp is the only signal a
// reader (Magpie, install.js status) has that "connected" is no longer true.
const status=(state,extra={},{force=false}={})=>{
  const now=Date.now();
  const signature=JSON.stringify({version,state,...extra});
  if(!force && signature===lastStatus && now-lastWrite<10000) return;
  atomic(file('status.json'),JSON.stringify({version,state,...extra,updated:new Date(now).toISOString(),heartbeat:now},null,2));
  lastStatus=signature;
  lastWrite=now;
};
const read=name=>JSON.parse(fs.readFileSync(file(name),'utf8'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const command=process.argv[2]||'status';
if(command==='status') {
  console.log(fs.existsSync(file('status.json'))?fs.readFileSync(file('status.json'),'utf8'):'未安装或尚未运行');
} else if(command==='restore') {
  console.log(JSON.stringify({preservedExternalChanges:restoreProxy(file('settings-journal.json'))}));
} else if(command==='supervise') {
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  if(typeof process.umask==='function'){try{process.umask(0o077);}catch{}}
  const lock=file('supervisor.lock');
  // Pid reuse made a crashed supervisor look alive forever; the lock now pins
  // the owner's start time and reclaims itself when that process is gone.
  const owner=claim(lock);
  // Declared before the first call: ensureWatch() reads these, and a `let` that
  // is still in its temporal dead zone throws instead of reading undefined.
  let watchSpawnedAt=0;
  let child=null,ready=null,ending=false,lastConfig='',nextRefresh=0,paused=false,lastModels=0,pausedRetries=0,magpieGate=null;
  // Windows has no service manager here: a hidden process that is killed does
  // not come back on its own, and Cursor is left dialing a closed port.
  ensureWatch();
  // Roughly a minute of retries at the 2s loop, then the journal is dropped and
  // the bridge reclaims the proxy keys, which is what the user expects anyway.
  const pauseLimit=30;
  async function stop() {
    // Restore before stopping the listener so Cursor does not point at a dead port.
    const old=child;child=null;ready=null;
    try {
      const journal=file('settings-journal.json');
      // Turning the agent off must hand Cursor its own model list back. A
      // journal is the accurate undo, but it can be missing after a crash or a
      // paused reclaim, and then the proxy keys would stay pointed at a port
      // that is about to close.
      // Cursor keeps using the address it already read, so removing the keys is
      // not enough on its own: it has to be told to read them again, otherwise
      // the model list keeps showing Magpie entries that no longer work.
      if(fs.existsSync(journal)) { const removed=restoreProxy(journal); ensureCursorReadsNewProxy(true); return removed; }
      const cleared=clearStaleProxy(settings); if(cleared.length) ensureCursorReadsNewProxy(true); return cleared;
    } finally {
      if(old && old.exitCode===null && old.signalCode===null) {
        if(process.platform==='win32') {
          // No /T: the engine is a direct child, and killing its tree has taken
          // down supervisors started from the same console. /F alone is enough.
          try {
            const killer=spawn('taskkill',['/F','/PID',String(old.pid)],{stdio:'ignore',windowsHide:true});
            killer.on?.('error',()=>{try{old.kill();}catch{}});
          } catch {try{old.kill();}catch{}}
        } else {
          old.kill('SIGTERM');
          await Promise.race([new Promise(r=>old.once('exit',r)),wait(12000)]);
          if(old.exitCode===null && old.signalCode===null) {
            old.kill('SIGKILL');
            await new Promise(r=>old.once('exit',r));
          }
        }
      }
    }
  }
  async function start(c) {
    atomic(file('effective.json'),JSON.stringify(c));
    const engine=spawn(engineBinary,[file('effective.json')],{
      // windowsHide: the supervisor has no console of its own, so Windows would
      // otherwise open a console window for the engine on every start.
      env:{...process.env,CURSOR_BYOK_DATA_DIR:file('data')},stdio:['pipe','pipe','pipe'],windowsHide:true
    });
    child=engine;
    // Native diagnostics can contain request information; never forward them into public logs.
    engine.stderr.resume();
    ready=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('bridge startup timed out')),30000);
      const lines=createInterface({input:engine.stdout});
      lines.on('line',line=>{try{const msg=JSON.parse(line);if(msg.event==='ready'){clearTimeout(timer);resolve(msg);}}catch{}});
      engine.once('error',()=>{clearTimeout(timer);reject(new Error('cannot start bridge engine'));});
      // Only a start that never reported ready is described here, and the exit
      // code alone does not prove the cause: 107 showed up on a machine whose CA
      // was trusted all along. Say what actually happened and let the reader
      // decide; the engine writes its own reason to stderr.
      engine.once('exit',(code,signal)=>{clearTimeout(timer);reject(new Error(`bridge engine exited before ready (${signal||code})`));});
    });
    await publishProxy(ready.proxy);
    // A fresh address has to reach Cursor, which caches the value it read.
    allowCursorRestart();
    ensureCursorReadsNewProxy(true);
  }
  // What Cursor is told to use. The relay keeps this constant across restarts.
  function publicProxy() {
    return relay ? `http://127.0.0.1:${relay.port}` : ready.proxy;
  }
  // The engine's port changes on every start, so the relay is what stays put.
  // It is started once and its upstream follows `engineProxy`.
  let engineProxy=null,relay=null;
  async function publishProxy(proxy) {
    engineProxy=proxy;
    const upstream=Number(new URL(proxy).port);
    if(relay) return applyProxy(settings,file('settings-journal.json'),`http://127.0.0.1:${relay.port}`);
    const {relay:created,port,fixed}=await listenFixed(()=>engineProxy?Number(new URL(engineProxy).port):upstream,relayPort);
    relay={server:created,port};
    // The preferred port is how Cursor keeps a working address across restarts;
    // saying so is better than silently publishing a different one.
    if(!fixed) status('starting',{reason:`端口 ${relayPort} 暂不可用，本次使用 ${port}；端口释放后会恢复`},{force:true});    return applyProxy(settings,file('settings-journal.json'),`http://127.0.0.1:${port}`);
  }
  async function closeRelay() {
    const old=relay;relay=null;
    if(old) { try { await old.server.close(); } catch {} }
  }
  // Cursor reads http.proxy once and keeps using that address until something
  // makes it reload its window. Killing Cursor for a toggle was the wrong trade:
  // the user loses every open editor to save a few seconds, and the restart is
  // what produced the 499s seen in the gateway log. The relay already keeps the
  // published address constant across engine restarts, so a toggle does not even
  // change the value Cursor holds -- re-reading is enough, and a reload costs no
  // unsaved work. CURSOR_BRIDGE_RESTART_CURSOR=1 restores the old kill for
  // anyone who prefers it.
  function reloadCursor() {
    if (process.env.CURSOR_BRIDGE_RESTART_CURSOR !== '1') return;
    try {
      if (process.platform === 'win32') {
        const killer=spawn('taskkill',['/F','/T','/IM','Cursor.exe'],{stdio:'ignore',windowsHide:true});
        killer.on?.('error',()=>{});
      } else if (process.platform === 'darwin') {
        const killer=spawn('pkill',['-x','Cursor'],{stdio:'ignore',windowsHide:true});
        killer.on?.('error',()=>{});
      }
    } catch { /* Cursor may not be running; that is not a failure */ }
  }
  // Called once per applied change, never per pass: a rewrite with the same
  // address leaves Cursor alone.
  let cursorRestarted=false;
  function ensureCursorReadsNewProxy(changed) {
    if(!changed || cursorRestarted) return;
    cursorRestarted=true;
    reloadCursor();
  }
  // A disconnect and the next connect are two separate changes, each of which
  // Cursor has to notice.
  function allowCursorRestart() { cursorRestarted=false; }
  function ensureWatch() {
    if (process.env.CURSOR_BRIDGE_NO_WATCHDOG === '1') return;
    // The watchdog is the only thing that revives a killed supervisor, so a
    // single attempt at startup is not enough: it can lose the race against a
    // previous watchdog that still holds the lock, and then exits silently and
    // nothing ever tries again. Re-check every loop and retry.
    if (watchAlive()) return;
    if (Date.now()-watchSpawnedAt < 15000) return;
    watchSpawnedAt=Date.now();
    try {
      const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'watch'],{
        detached:true,stdio:'ignore',windowsHide:true,
        env:{...process.env,CURSOR_BRIDGE_ROOT:root,CURSOR_BRIDGE_SETTINGS:settings}
      });
      child.unref();
    } catch { /* the next pass tries again */ }
  }
  // A live watchdog holds watchdog.lock with its pid and start time, and claim()
  // reclaims a stale one, so the recorded owner is the only honest signal.
  function watchAlive() {
    return held(file('watchdog.lock/owner.json'));
  }
  const signals=process.platform==='win32'?['SIGINT','SIGBREAK']:['SIGTERM','SIGINT'];
  for(const signal of signals) process.on(signal,()=>{ending=true;});
  // A supervisor must never leave Cursor pointed at a proxy that is gone: that
  // turns every request into "failed to establish a socket connection" with no
  // hint about the cause. Interactive stop() runs on signals; this covers the
  // abrupt exits signals cannot see (SIGHUP on console close, fatal errors).
  const panic=()=>{try{
    const journal=file('settings-journal.json');
    if(fs.existsSync(journal)) restoreProxy(journal); else clearStaleProxy(settings);
  }catch{}};
  process.on('exit',panic);
  process.on('uncaughtException',error=>{panic();status('error',{reason:error?.message||String(error)},{force:true});process.exit(1);});
  process.on('unhandledRejection',()=>{/* keep serving; a single request must not stop the proxy */});
  try {
    restoreProxy(file('settings-journal.json'));
    // Publish the wait before it happens: the engine needs seconds to start, and
    // readers must not mistake that gap for the previous run's state.
    status('starting',{reason:'正在启动后台桥接'},{force:true});
    while(!ending) {
      // Kept outside the try below: a watchdog that cannot be started must never
      // be the reason the proxy stops serving.
      try { ensureWatch(); } catch {}
      try {
        // Magpie switches an agent off in its own state, leaving this plugin's
        // config untouched. A missing `wired` flag also appears after Magpie
        // restarts, so only an on-to-off transition stops the bridge; otherwise
        // toggling it back on could never bring the proxy up again.
        const gate=nextMagpieGate(magpieGate, readWired());
        magpieGate=gate.next;
        if(gate.hold) {
          await stop();
          status('disconnected',{reason:'已在 Magpie 中关闭接入'},{force:true});
          paused=false;lastConfig='';lastModels=0;
          if(!ending) await wait(600);
          continue;
        }
        const raw=fs.existsSync(file('connection.json'))?fs.readFileSync(file('connection.json'),'utf8'):'{}';
        const c=validate(JSON.parse(raw));
        if(!c) {await stop();status('disconnected',{}, {force:true});paused=false;lastConfig='';}
        else if(paused && raw===lastConfig) {
          // The journal says another program owns the proxy keys now. That is
          // often Cursor rewriting settings.json on its own restart, not a real
          // conflict, so retry rather than staying down until a manual toggle.
          pausedRetries++;
          if(pausedRetries>=pauseLimit) {
            try {fs.rmSync(file('settings-journal.json'),{force:true});} catch {}
            paused=false;pausedRetries=0;lastConfig='';
          } else {
            status('paused',{reason:'Cursor 代理设置被其他程序改动，正在重试接管…'});
          }
        }
        else {
          const changed=raw!==lastConfig;
          if(changed || Date.now()>=nextRefresh || !child || child.exitCode!==null || child.signalCode!==null) {
            const effective=await gatewayModels(c);
            // The gateway answers in tens of milliseconds, so a longer period
            // only delayed a model added in Magpie; Cursor re-reads the catalog
            // on its own schedule and needs the new entries to be there.
            nextRefresh=Date.now()+4000;
            if(!child || child.exitCode!==null || child.signalCode!==null) {
              await stop();await start(effective);
            } else atomic(file('effective.json'),JSON.stringify(effective));
            lastConfig=raw;paused=false;lastModels=effective.models.length;pausedRetries=0;
            status('connected',{model:c.model,models:lastModels,proxy:publicProxy(),backend:ready.backend,pid:child.pid},{force:true});
          } else {
            // The proxy is reapplied on every pass, so an unchanged state would
            // otherwise never be rewritten; readers rely on the heartbeat.
            status('connected',{model:c.model,models:lastModels,proxy:publicProxy(),backend:ready.backend,pid:child.pid});
          }
          try {
            // Only a real change needs Cursor restarted: a rewrite of the same
            // address happens every pass and must stay silent.
            ensureCursorReadsNewProxy(applyProxy(settings,file('settings-journal.json'),publicProxy()));
          } catch(e) {
            await stop();paused=true;lastConfig=raw;throw e;
          }
        }
      } catch(e) {
        try {await stop();} catch { /* keep journal for recovery after malformed settings are fixed */ }
        status('error',{reason:e.message},{force:true});
      }
      // A toggle is noticed within one pass; the gateway call this guards costs
      // tens of milliseconds, so a shorter period is cheap and removes the wait
      // a user sees between flipping the switch and seeing models.
      if(!ending) await wait(600);
    }
  } finally {
    await stop();await closeRelay();status('stopped',{},{force:true});release(lock,owner);
  }
} else if(command==='watch') {
  if (process.env.CURSOR_BRIDGE_NO_WATCHDOG === '1') process.exit(0);
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  let watchOwner;
  try { watchOwner=claim(file('watchdog.lock')); }
  catch { process.exit(0); }
  let ending=false;
  const signals=process.platform==='win32'?['SIGINT','SIGBREAK']:['SIGTERM','SIGINT'];
  for (const signal of signals) process.on(signal,()=>{ending=true;});
  const script=fileURLToPath(import.meta.url);
  while(!ending) {
    let revive=false;
    try {
      if(!held(path.join(file('supervisor.lock'),'owner.json'))) {
        let recorded=null;
        try { recorded=JSON.parse(fs.readFileSync(file('status.json'),'utf8')); } catch {}
        revive=shouldRevive(recorded);
      }
    } catch { revive=false; }
    if(revive) {
      try {
        const child=spawn(process.execPath,[script,'supervise'],{
          detached:true,stdio:'ignore',windowsHide:true,
          env:{...process.env,CURSOR_BRIDGE_ROOT:root,CURSOR_BRIDGE_SETTINGS:settings}
        });
        child.unref();
        fs.appendFileSync(file('watchdog.log'),`${new Date().toISOString()} relaunch\n`);
      } catch {}
      await wait(15000);
    } else await wait(5000);
  }
  release(file('watchdog.lock'),watchOwner);
} else {throw new Error('usage: node bridge.js status|supervise|restore|watch');}