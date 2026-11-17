// Explicit setup action only. No job or financial records are created by installation.
import {mkdir,writeFile,chmod} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
assert.equal(process.platform,'darwin','This installer is only for the local macOS host.');
const root=process.cwd(),label='com.cocotte.sales-worker',folder=join(homedir(),'Library','LaunchAgents'),path=join(folder,`${label}.plist`);
const xml=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const body=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${[process.execPath,'--conditions=react-server','--import','tsx','scripts/workers/sales.ts'].map(v=>`<string>${xml(v)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(root)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(dirname(process.execPath))}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>5</integer><key>StandardOutPath</key><string>/private/tmp/cocotte-sales-worker.log</string><key>StandardErrorPath</key><string>/private/tmp/cocotte-sales-worker.log</string></dict></plist>\n`;
await mkdir(folder,{recursive:true});await writeFile(path,body,{flag:'wx',mode:0o600});await chmod(path,0o600);
await promisify(execFile)('launchctl',['bootstrap',`gui/${process.getuid!()}`,path]);
console.log('Installed com.cocotte.sales-worker. PostgreSQL-backed jobs start only after an authorised dashboard click.');
