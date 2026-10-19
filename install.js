#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {atomic,restoreProxy} from './lib/settings.js';
import {paths,run,verifyPackage,initializeCertificate,stage,activate,stopJob,label} from './lib/install.js';
const source=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
const command=process.argv[2]||'setup';
// agent.js passes CURSOR_BRIDGE_ROOT when it falls back to setup(), and tests
// rely on it to install into a scratch tree. Ignoring it made "isolated" runs
// rewrite the real profile: installation.json, the release dir and the Startup
// entry all landed in the user's home, and a second supervisor came up.
const rooted=process.env.CURSOR_BRIDGE_ROOT;
const p=pathed(paths(os.homedir()));
function pathed(base) {
  if (!rooted) return base;
  // stage() puts releases under p.target, so a rooted install keeps them there.
  return {
    ...base,
    root: rooted,
    target: rooted,
    startupScript: process.platform === 'win32'
      ? path.join(rooted, 'Startup', `${label}.vbs`)
      : base.startupScript
  };
}

function findMagpie() {
  if (process.env.MAGPIE_PATH && fs.existsSync(process.env.MAGPIE_PATH)) return process.env.MAGPIE_PATH;
  if (process.platform === 'win32') {
    const candidates = [
      path.join(os.homedir(), 'Desktop/magpie-windows-amd64.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs/magpie/magpie.exe'),
      path.join(os.homedir(), 'Desktop/magpie.exe')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    const where = run('where', ['magpie.exe'], {optional:true});
    if (where.status === 0 && where.stdout.trim()) return where.stdout.trim().split(/\r?\n/)[0];
    return null;
  }
  const macPath = '/Applications/magpie.app/Contents/MacOS/magpie';
  return fs.existsSync(macPath) ? macPath : null;
}

try {
  if(command==='--help'||command==='-h') {
    console.log('Usage: node install.js [setup|status|uninstall|--version]\nsetup: install/update the paired plugin and service.');
  } else if(command==='--version') {
    console.log(manifest.version);
  } else if(command==='status') {
    console.log(fs.existsSync(path.join(p.root,'status.json'))?fs.readFileSync(path.join(p.root,'status.json'),'utf8'):'未安装或尚未运行');
  } else {
    if(!['setup','uninstall'].includes(command)) throw new Error('未知命令；使用 --help 查看用法');
    const isSupported = (process.platform === 'darwin' && process.arch === 'arm64') || (process.platform === 'win32' && process.arch === 'x64');
    if(!isSupported) throw new Error('此版本支持 Apple Silicon macOS 与 Windows x64');
    const domain = process.platform === 'darwin' && process.getuid ? `gui/${process.getuid()}` : '';
    const magpie = findMagpie();
    fs.mkdirSync(p.root,{recursive:true,mode:0o700});
    if (process.platform !== 'win32') {
      try { fs.chmodSync(p.root,0o700); } catch {}
    }
    const lock=path.join(p.root,'installer.lock');
    try {fs.mkdirSync(lock);} catch {throw new Error('另一个安装程序正在运行；若上次被强制终止，请检查后移除 installer.lock 再重试');}
    try {
      if(command==='uninstall') {
        if(magpie) run(magpie,['cursor-bridge','default'],{optional:true});
        await stopJob(p,domain);
        restoreProxy(path.join(p.root,'settings-journal.json'));
        if(magpie) run(magpie,['plugin','rm',p.target],{optional:true});
        if(p.plist && fs.existsSync(p.plist)) fs.unlinkSync(p.plist);
        if(p.startupScript && fs.existsSync(p.startupScript)) fs.unlinkSync(p.startupScript);
        console.log('后台已卸载，Cursor 代理已还原。若从 Magpie 插件页安装，请同时移除该插件。证书、数据及恢复记录保留。');
      } else {
        verifyPackage(source);
        const isWin = process.platform === 'win32';
        const enginePath = path.join(source, 'bin', isWin ? 'cursor-magpie-bridge.exe' : 'cursor-magpie-bridge');
        initializeCertificate(enginePath, p);
        const release=stage(source,p,manifest.version,process.execPath);
        const configHome=process.env.XDG_CONFIG_HOME||path.join(p.home,'.config');
        const packagePath=path.join(configHome,'magpie/plugins/node_modules',manifest.name);
        const desktopPlugins=path.join(p.home,'Desktop/data/plugins/node_modules',manifest.name);
        let registered=false;
        try {
          if (fs.existsSync(packagePath) && fs.realpathSync(packagePath) === fs.realpathSync(source)) registered = true;
          if (fs.existsSync(desktopPlugins) && fs.realpathSync(desktopPlugins) === fs.realpathSync(source)) registered = true;
        } catch {}
        if(registered) {
          if(magpie) run(magpie,['plugin','rm',p.target],{optional:true});
        } else {
          atomic(path.join(p.target,'agent.js'),fs.readFileSync(path.join(source,'agent.js'),'utf8'));
          atomic(path.join(p.target,'package.json'),JSON.stringify({name:manifest.name,version:manifest.version,type:'module',magpie:manifest.magpie},null,2));
        }
        await activate(p,release,domain);
        atomic(path.join(p.root,'installation.json'),JSON.stringify({version:manifest.version,release,source,installed:new Date().toISOString()},null,2));
        console.log(`已成功安装并启动 v${manifest.version}。在 Magpie → Agents 选择 Cursor · Magpie Bridge 和模型；首次连接后重启 Cursor 即可开始使用。`);
      }
    } finally {
      try { fs.rmdirSync(lock); } catch {}
    }
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
