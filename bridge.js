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
  // Windows has no service manager here: a hidden process that is killed does
  // not come back on its own, and Cursor is left dialing a closed port.
  ensureWatch();
  let child=null,ready=null,ending=false,lastConfig='',nextRefresh=0,paused=false,lastModels=0,pausedRetries=0,magpieGate=null;
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
      if(fs.existsSync(journal)) return restoreProxy(journal);
      return clearStaleProxy(settings);
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
      engine.once('exit',(code,signal)=>{clearTimeout(timer);reject(new Error(`bridge engine stopped (${signal||code}); check certificate trust`));});
    });
    applyProxy(settings,file('settings-journal.json'),ready.proxy);
  }
  function ensureWatch() {
    if (process.env.CURSOR_BRIDGE_NO_WATCHDOG === '1') return;
    try {
      const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'watch'],{
        detached:true,stdio:'ignore',windowsHide:true,
        env:{...process.env,CURSOR_BRIDGE_ROOT:root,CURSOR_BRIDGE_SETTINGS:settings}
      });
      child.unref();
    } catch { /* the next supervise start tries again */ }
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
          if(!ending) await wait(2000);
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
            nextRefresh=Date.now()+15000;
            if(!child || child.exitCode!==null || child.signalCode!==null) {
              await stop();await start(effective);
            } else atomic(file('effective.json'),JSON.stringify(effective));
            lastConfig=raw;paused=false;lastModels=effective.models.length;pausedRetries=0;
            status('connected',{model:c.model,models:lastModels,proxy:ready.proxy,backend:ready.backend,pid:child.pid},{force:true});
          } else {
            // The proxy is reapplied on every pass, so an unchanged state would
            // otherwise never be rewritten; readers rely on the heartbeat.
            status('connected',{model:c.model,models:lastModels,proxy:ready.proxy,backend:ready.backend,pid:child.pid});
          }
          try {applyProxy(settings,file('settings-journal.json'),ready.proxy);} catch(e) {
            await stop();paused=true;lastConfig=raw;throw e;
          }
        }
      } catch(e) {
        try {await stop();} catch { /* keep journal for recovery after malformed settings are fixed */ }
        status('error',{reason:e.message},{force:true});
      }
      if(!ending) await wait(2000);
    }
  } finally {
    await stop();status('stopped',{},{force:true});release(lock,owner);
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