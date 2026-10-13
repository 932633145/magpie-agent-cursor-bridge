#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {atomic,restoreProxy} from './lib/settings.js';
import {paths,run,verifyPackage,initializeCertificate,stage,activate,stopJob} from './lib/install.js';
const source=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
const command=process.argv[2]||'setup';
const p=paths(os.homedir());
try {
  if(command==='--help'||command==='-h') console.log('Usage: bash setup.command [setup|status|uninstall|--version]\nsetup: install/update the paired plugin and service; macOS may prompt for certificate trust.');
  else if(command==='--version') console.log(manifest.version);
  else if(command==='status') {
    console.log(fs.existsSync(path.join(p.root,'status.json'))?fs.readFileSync(path.join(p.root,'status.json'),'utf8'):'未安装或尚未运行');
  } else {
    if(!['setup','uninstall'].includes(command)) throw new Error('未知命令；使用 --help 查看用法');
    if(process.platform!=='darwin'||process.arch!=='arm64') throw new Error('此版本仅支持 Apple Silicon macOS');
    const domain=`gui/${process.getuid()}`;
    const magpie='/Applications/magpie.app/Contents/MacOS/magpie';
    if(!fs.existsSync(magpie)) throw new Error('请先将 Magpie 安装到 /Applications');
    fs.mkdirSync(p.root,{recursive:true,mode:0o700});fs.chmodSync(p.root,0o700);
    // One installer owns both certificate initialization and service activation.
    const lock=path.join(p.root,'installer.lock');
    try {fs.mkdirSync(lock);} catch {throw new Error('另一个安装程序正在运行；若上次被强制终止，请检查后移除 installer.lock 再重试');}
    try {
      if(command==='uninstall') {
        run(magpie,['cursor-bridge','default'],{optional:true});
        await stopJob(p,domain);restoreProxy(path.join(p.root,'settings-journal.json'));
        run(magpie,['plugin','rm',p.target],{optional:true});
        if(fs.existsSync(p.plist)) fs.unlinkSync(p.plist);
        console.log('后台已卸载，Cursor 代理已还原。若从 Magpie 插件页安装，请同时移除该插件。证书、数据及恢复记录保留。');
      } else {
        verifyPackage(source);
        initializeCertificate(path.join(source,'bin/cursor-magpie-bridge'),p);
        // Copy the runtime locally so Magpie cache cleanup cannot break the LaunchAgent.
        const release=stage(source,p,manifest.version,process.execPath);
        // A package installed by Magpie is already registered; ZIP installs register a stable local descriptor.
        const configHome=process.env.XDG_CONFIG_HOME||path.join(p.home,'.config');
        const packagePath=path.join(configHome,'magpie/plugins/node_modules',manifest.name);
        const registered=fs.existsSync(packagePath)&&fs.realpathSync(packagePath)===fs.realpathSync(source);
        if(registered) {
          run(magpie,['plugin','rm',p.target],{optional:true});
        } else {
          atomic(path.join(p.target,'agent.js'),fs.readFileSync(path.join(source,'agent.js'),'utf8'));
          atomic(path.join(p.target,'package.json'),JSON.stringify({name:manifest.name,version:manifest.version,type:'module',magpie:manifest.magpie},null,2));
          run(magpie,['plugin','add',p.target]);
        }
        await activate(p,release,domain);
        atomic(path.join(p.root,'installation.json'),JSON.stringify({version:manifest.version,release,source,installed:new Date().toISOString()},null,2));
        console.log(`已安装 v${manifest.version}。在 Magpie → Agents 选择 Cursor · Magpie Bridge 和模型；首次连接后重启 Cursor。`);
      }
    } finally {fs.rmdirSync(lock);}
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
