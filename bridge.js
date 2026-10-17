#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {atomic,applyProxy,restoreProxy} from './lib/settings.js';
import {validate,gatewayModels} from './lib/config.js';

const packageDir=path.dirname(fileURLToPath(import.meta.url));
const version=JSON.parse(fs.readFileSync(path.join(packageDir,'package.json'),'utf8')).version;
const root=process.env.CURSOR_BRIDGE_ROOT||path.join(os.homedir(),'.config/magpie-cursor-bridge');
const defaultSettings=process.platform==='win32'
  ? path.join(process.env.APPDATA||path.join(os.homedir(),'AppData/Roaming'),'Cursor/User/settings.json')
  : path.join(os.homedir(),'Library/Application Support/Cursor/User/settings.json');
const settings=process.env.CURSOR_BRIDGE_SETTINGS||defaultSettings;
const engineBinary=path.join(packageDir,'bin',process.platform==='win32'?'cursor-magpie-bridge.exe':'cursor-magpie-bridge');
const file=name=>path.join(root,name);
let lastStatus='';
const status=(state,extra={})=>{const signature=JSON.stringify({version,state,...extra});if(signature!==lastStatus){atomic(file('status.json'),JSON.stringify({version,state,...extra,updated:new Date().toISOString()},null,2));lastStatus=signature;}};
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
  try {fs.mkdirSync(lock);} catch(error) {
    let live=false;
    try {process.kill(Number(fs.readFileSync(path.join(lock,'pid'),'utf8')),0);live=true;} catch {}
    if(live) throw new Error('bridge supervisor already running');
    fs.rmSync(lock,{recursive:true,force:true}); fs.mkdirSync(lock);
  }
  fs.writeFileSync(path.join(lock,'pid'),String(process.pid));
  let child=null,ready=null,ending=false,lastConfig='',nextRefresh=0,paused=false;
  async function stop() {
    // Restore before stopping the listener so Cursor does not point at a dead port.
    const old=child;child=null;ready=null;
    try {
      return restoreProxy(file('settings-journal.json'));
    } finally {
      if(old && old.exitCode===null && old.signalCode===null) {
        if(process.platform==='win32') {
          try {spawn('taskkill',['/F','/T','/PID',String(old.pid)],{stdio:'ignore'});} catch {old.kill();}
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
      env:{...process.env,CURSOR_BYOK_DATA_DIR:file('data')},stdio:['pipe','pipe','pipe']
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
  const signals=process.platform==='win32'?['SIGINT','SIGBREAK']:['SIGTERM','SIGINT'];
  for(const signal of signals) process.on(signal,()=>{ending=true;});
  try {
    restoreProxy(file('settings-journal.json'));
    while(!ending) {
      try {
        const raw=fs.existsSync(file('connection.json'))?fs.readFileSync(file('connection.json'),'utf8'):'{}';
        const c=validate(JSON.parse(raw));
        if(!c) {await stop();status('disconnected');paused=false;lastConfig='';}
        else if(paused && raw===lastConfig) {status('paused',{reason:'Cursor 代理设置由其他程序改动；请在 Magpie 中断开后重新连接。'});}
        else {
          const changed=raw!==lastConfig;
          if(changed || Date.now()>=nextRefresh || !child || child.exitCode!==null || child.signalCode!==null) {
            const effective=await gatewayModels(c);
            nextRefresh=Date.now()+15000;
            if(!child || child.exitCode!==null || child.signalCode!==null) {
              await stop();await start(effective);
            } else atomic(file('effective.json'),JSON.stringify(effective));
            lastConfig=raw;paused=false;
            status('connected',{model:c.model,models:effective.models.length,proxy:ready.proxy,backend:ready.backend,pid:child.pid});
          }
          try {applyProxy(settings,file('settings-journal.json'),ready.proxy);} catch(e) {
            await stop();paused=true;lastConfig=raw;throw e;
          }
        }
      } catch(e) {
        try {await stop();} catch { /* keep journal for recovery after malformed settings are fixed */ }
        status('error',{reason:e.message});
      }
      if(!ending) await wait(2000);
    }
  } finally {
    await stop();status('stopped');fs.rmSync(lock,{recursive:true,force:true});
  }
} else {throw new Error('usage: node bridge.js status|supervise|restore');}
