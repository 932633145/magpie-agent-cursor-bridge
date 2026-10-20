import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {atomic,restoreProxy} from './settings.js';
import {processStartTime} from './lock.js';

export const label='local.magpie.cursor-bridge';
export const payload=['agent.js','bridge.js','install.js','setup.command','setup.ps1','setup.cmd','package.json','npm-shrinkwrap.json','lib','bin','icon.svg','icon.png','README.md','LICENSE','THIRD_PARTY_NOTICES.md'];
export function run(command,args,options={}) {
  // windowsHide: the installer is started hidden, so a child console window
  // would otherwise flash on screen for every command it runs.
  const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,...options});
  if(result.status!==0&&!options.optional) throw new Error(`${path.basename(command)} failed: ${(result.stderr||result.stdout||result.error?.message||'').slice(0,1000)}`);
  return result;
}
export function paths(home) {
  const isWin = process.platform === 'win32';
  // Startup belongs to the profile that owns `home`. Reading APPDATA
  // unconditionally meant a test running with a temp `home` wrote the real
  // Startup entry, and the vbs then pointed at a temp release that was deleted
  // when the test finished. Every later login started nothing, silently.
  const appData = isRealProfile(home)
    ? (process.env.APPDATA || path.join(home, 'AppData/Roaming'))
    : path.join(home, 'AppData/Roaming');
  return {
    home,
    root: path.join(home, '.config/magpie-cursor-bridge'),
    target: path.join(home, '.local/share/magpie-cursor-bridge'),
    plist: path.join(home, 'Library/LaunchAgents', label + '.plist'),
    startupScript: isWin ? path.join(appData, 'Microsoft/Windows/Start Menu/Programs/Startup', `${label}.vbs`) : null
  };
}
// True only for the profile this process runs in; a caller may pass any home.
function isRealProfile(home) {
  return path.resolve(home) === path.resolve(os.homedir());
}
function dependencyDirectory(source) {
  const require=createRequire(path.resolve(source,'package.json'));
  const manifest=require.resolve('jsonc-parser/package.json');
  if(JSON.parse(fs.readFileSync(manifest,'utf8')).version!=='3.3.1') throw new Error('jsonc-parser 依赖版本不一致，请重新安装插件');
  return path.dirname(manifest);
}
export function verifyPackage(source,exec=run) {
  dependencyDirectory(source);
  for(const name of payload) fs.accessSync(path.join(source,name),fs.constants.R_OK);
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  if(!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('无效的发布版本');
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'bin/cursor-magpie-bridge.exe' : 'bin/cursor-magpie-bridge';
  const engine = path.join(source, binName);
  if (!fs.existsSync(engine)) throw new Error(`缺少桥接程序: ${binName}`);
  const actual = createHash('sha256').update(fs.readFileSync(engine)).digest('hex');
  const checksums = JSON.parse(fs.readFileSync(path.join(source,'integrity.json'),'utf8'));
  const expected = isWin ? (checksums.engine_win32_x64 || checksums.engine) : checksums.engine;
  if(expected && expected!==actual) throw new Error('桥接程序校验失败，请重新下载完整安装包');
  // The engine's version is compiled into the native binary, so a JavaScript
  // release cannot change it. integrity.json pins the engine build the package
  // was verified against; only a missing pin still implies a matching release.
  const engineVersion = checksums.engine_version || checksums.version;
  const reported = exec(engine,['--version']).stdout.trim();
  if(engineVersion && reported !== engineVersion) {
    throw new Error(`后台程序版本与安装包不符：期望 ${engineVersion}，实际 ${reported}`);
  }
  return manifest;
}
export function initializeCertificate(engine,p,exec=run,{trust=true}={}) {
  const inspect=()=>{
    const output=exec(engine,['--init-ca'],{env:{...process.env,CURSOR_BYOK_DATA_DIR:path.join(p.root,'data')}});
    return {state:JSON.parse(output.stdout),raw:output.stdout};
  };
  const {state}=inspect();
  const cert=path.join(p.root,'data/ca/ca.crt');
  if (process.platform === 'win32') {
    // The bundled engine answers with its own verdict, so trust is never
    // inferred from a certutil listing. It reads the local machine store: our
    // per-user import leaves it reporting "untrusted", and the bridge then
    // refuses to start even though setup looked successful.
    if (state.ca === 'ready') return state;
    if (!trust) throw new Error('本机证书尚未受信任，请运行初始化并完成证书授权');
    console.log('正在将本地桥接根证书导入受信任根证书库（需要确认管理员提示）...');
    exec('powershell', ['-NoProfile', '-Command', `Start-Process certutil -ArgumentList '-addstore -f Root "${cert}"' -Verb RunAs -Wait`], {optional:true});
    if (inspect().state.ca !== 'ready') {
      throw new Error('证书导入未完成或被取消；请重新运行初始化并在弹窗中选择“是”');
    }
    return inspect().state;
  } else {
    const verify=()=>exec('/usr/bin/security',['verify-cert','-c',cert,'-p','ssl'],{optional:true}).status===0;
    if(!verify()) {
      if(!trust) throw new Error('本机证书尚未受信任，请在终端运行初始化并完成 macOS 授权');
      console.log('正在信任本机生成的桥接证书；macOS 可能要求确认或密码。私钥只保存在本机。');
      exec('/usr/bin/security',['add-trusted-cert','-r','trustRoot','-p','ssl','-k',path.join(p.home,'Library/Keychains/login.keychain-db'),cert],{stdio:'inherit'});
      if(!verify()) throw new Error('证书信任未完成；后台服务尚未安装，可完成授权后重试');
    }
  }
  return state;
}
export function plistText(p,runtime,release) {
  const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const args=[runtime,path.join(release,'bridge.js'),'supervise'].map(s=>`<string>${esc(s)}</string>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args}</array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>5</integer><key>ExitTimeOut</key><integer>20</integer><key>Umask</key><integer>63</integer><key>StandardOutPath</key><string>${esc(path.join(p.root,'supervisor.log'))}</string><key>StandardErrorPath</key><string>${esc(path.join(p.root,'supervisor-error.log'))}</string></dict></plist>`;
}
export async function stopJob(p,domain,exec=run) {
  if (process.platform === 'win32') {
    // Prefer the recorded owner: the pid file can hold a stale number that
    // Windows has since handed to another process, and /T would then kill an
    // unrelated tree. Only a supervisor that still answers as the recorded
    // owner is terminated.
    // The watchdog holds its own lock and outlives the supervisor it guards, so
    // stopping only the supervisor left the previous release's watchdog running
    // for hours, watching a directory that had already been replaced.
    for (const lock of ['watchdog.lock', 'supervisor.lock']) {
      try {
        const owner = JSON.parse(fs.readFileSync(path.join(p.root, lock, 'owner.json'), 'utf8'));
        const pid = Number(owner.pid);
        if (pid > 0 && processStartTime(pid) === owner.start) {
          exec('taskkill', ['/F', '/PID', String(pid)], {optional:true});
        }
      } catch {}
      try { fs.rmSync(path.join(p.root, lock), {recursive:true, force:true}); } catch {}
    }
    if (p.startupScript && fs.existsSync(p.startupScript)) {
      try { fs.unlinkSync(p.startupScript); } catch {}
    }
    return;
  }
  exec('/bin/launchctl',['bootout',`${domain}/${label}`],{optional:true});
  // The watchdog is a separate detached process with its own lock, so booting
  // the job out does not stop it.
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(p.root, 'watchdog.lock', 'owner.json'), 'utf8'));
    const pid = Number(owner.pid);
    if (pid > 0) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  } catch {}
  try { fs.rmSync(path.join(p.root,'watchdog.lock'),{recursive:true,force:true}); } catch {}
  for(let attempt=0;attempt<40;attempt++) {
    const registered=exec('/bin/launchctl',['print',`${domain}/${label}`],{optional:true}).status===0;
    let alive=false;
    try {const pid=Number(fs.readFileSync(path.join(p.root,'supervisor.lock/pid'),'utf8'));if(pid>0){process.kill(pid,0);alive=true;}} catch {}
    if(!registered&&!alive) return;
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error('旧桥接尚未停止，请稍后重试安装');
}
export async function bootstrap(p,domain,exec=run) {
  for(let attempt=0;attempt<5;attempt++) {
    if(exec('/bin/launchctl',['bootstrap',domain,p.plist],{optional:true}).status===0) return;
    if(attempt<4) await new Promise(r=>setTimeout(r,1000));
  }
  throw new Error('macOS 未能启动后台桥接');
}
// Stage a complete immutable copy before stopping the working service. Never overwrite a running executable.
export function stage(source,p,version,runtime) {
  fs.mkdirSync(path.join(p.target,'releases'),{recursive:true,mode:0o700});
  const release=fs.mkdtempSync(path.join(p.target,'releases',version+'-'));
  const isWin = process.platform === 'win32';
  try {
    for(const name of [...payload,'integrity.json']) {
      const srcPath = path.join(source, name);
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, path.join(release, name), {recursive:true, dereference:true});
      }
    }
    fs.cpSync(dependencyDirectory(source), path.join(release,'node_modules/jsonc-parser'), {recursive:true, dereference:true});
    const binName = isWin ? 'bin/cursor-magpie-bridge.exe' : 'bin/cursor-magpie-bridge';
    if (!isWin && fs.existsSync(path.join(release, binName))) fs.chmodSync(path.join(release, binName), 0o755);
    const runtimeName = isWin ? 'bin/runtime.exe' : 'bin/runtime';
    fs.copyFileSync(runtime, path.join(release, runtimeName));
    if (!isWin) fs.chmodSync(path.join(release, runtimeName), 0o755);
    return release;
  } catch(e) {fs.rmSync(release,{recursive:true,force:true});throw e;}
}
export async function activate(p,release,domain,exec=run) {
  const isWin = process.platform === 'win32';
  await stopJob(p,domain,exec);
  restoreProxy(path.join(p.root,'settings-journal.json'));
  if (isWin) {
    const runtime = path.join(release, 'bin', 'runtime.exe');
    const bridgeScript = path.join(release, 'bridge.js');
    const vbsContent = [
      'Set WshShell = CreateObject("WScript.Shell")',
      `WshShell.Run """${runtime}"" ""${bridgeScript}"" supervise", 0, False`,
      ''
    ].join('\r\n');
    atomic(p.startupScript, vbsContent);
    // A startup entry that does not name this release means the next login
    // starts the previous build; saying so now beats discovering it later.
    const written = fs.existsSync(p.startupScript) ? fs.readFileSync(p.startupScript, 'utf8') : '';
    if (!written.includes(release)) throw new Error(`启动项未指向本次发布：${p.startupScript}`);
    exec('wscript.exe', [p.startupScript]);
    console.log('Windows 后台桥接服务已启动并在后台持续运行。');
  } else {
    const previous=fs.existsSync(p.plist)?fs.readFileSync(p.plist,'utf8'):null;
    atomic(p.plist,plistText(p,path.join(release,'bin/runtime'),release));
    try {await bootstrap(p,domain,exec);} catch(error) {
      await stopJob(p,domain,exec);
      if(previous!==null) {atomic(p.plist,previous);await bootstrap(p,domain,exec);}
      else fs.unlinkSync(p.plist);
      throw error;
    }
  }
}
