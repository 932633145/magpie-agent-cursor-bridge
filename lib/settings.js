import fs from 'node:fs';
import path from 'node:path';
import { parse, modify, applyEdits } from 'jsonc-parser';

export function atomic(file, text) {
  fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
  const temp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
export function document(file) {
  const text = fs.existsSync(file) ? fs.readFileSync(file,'utf8') : '{}\n';
  const errors = [];
  const data = parse(text, errors, {allowTrailingComma:true});
  if (errors.length || !data || Array.isArray(data) || typeof data !== 'object') throw new Error('invalid settings JSONC');
  return {text,data};
}
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const state = (data,k) => Object.hasOwn(data,k) ? {exists:true,value:data[k]} : {exists:false};
function edit(text,k,s) {
  return applyEdits(text, modify(text,[k],s.exists ? s.value : undefined,{formattingOptions:{insertSpaces:true,tabSize:2,eol:text.includes('\r\n')?'\r\n':'\n'}}));
}
export function applyProxy(settings, journalFile, proxy) {
  const desired = {
    'http.proxy':proxy, 'http.proxyKerberosServicePrincipal':proxy,
    'http.proxySupport':'on', 'cursor.general.disableHttp2':true,
    'http.experimental.systemCertificatesV2':true, 'http.noProxy':[]
  };
  const {text,data} = document(settings);
  const previous = fs.existsSync(journalFile) ? JSON.parse(fs.readFileSync(journalFile,'utf8')) : null;
  if (previous && previous.settings !== settings) throw new Error('journal settings path differs');
  const journal = previous || {settings,entries:{},originalText:text};
  let updated = text;
  for (const [key,value] of Object.entries(desired)) {
    const applied = value === undefined ? {exists:false} : {exists:true,value};
    const prior = journal.entries[key];
    if (prior && !equal(state(data,key),prior.applied)) throw new Error('Cursor proxy settings changed externally; bridge paused');
    journal.entries[key] = {before:prior?.before || state(data,key), applied};
    updated = edit(updated,key,applied);
  }
  // Durable undo information precedes the settings write.
  if (previous && updated === text && previous.appliedText === updated) return;
  journal.appliedText=updated;
  atomic(journalFile,JSON.stringify(journal,null,2));
  if (updated !== text) atomic(settings,updated);
}
export function restoreProxy(journalFile) {
  if (!fs.existsSync(journalFile)) return [];
  const journal=JSON.parse(fs.readFileSync(journalFile,'utf8'));
  const {text,data}=document(journal.settings);
  if (text===journal.appliedText && typeof journal.originalText==='string') {
    atomic(journal.settings,journal.originalText);fs.unlinkSync(journalFile);return [];
  }
  let updated=text;
  const skipped=[];
  for (const [key,entry] of Object.entries(journal.entries)) {
    if (equal(state(data,key),entry.applied)) updated=edit(updated,key,entry.before);
    else if (!equal(state(data,key),entry.before)) skipped.push(key);
  }
  if (updated!==text) atomic(journal.settings,updated);
  fs.unlinkSync(journalFile);
  return skipped;
}
