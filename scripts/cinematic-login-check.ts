// Disposable PostgreSQL and local browser only. Never uses real accounts or Zonal.
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Pool} from 'pg';
import {chromium,expect,devices} from '@playwright/test';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readdir,readFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/lib/password';
import {ALL_PERMISSIONS} from '../src/lib/permissions';
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'cocotte-entrance-')),cluster=join(root,'pg'),screens='/private/tmp/cocotte-cinematic-review';
const url='postgresql://entrance_test@127.0.0.1:51948/postgres';
if(url===process.env.DATABASE_URL)throw new Error('Isolated database required.');
let started=false,app:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,prisma:PrismaClient|undefined,step='setup';
const secret=randomBytes(24).toString('base64url'),base='http://localhost:3183';
try{
 await mkdir(screens,{recursive:true});await exec('initdb',['-D',cluster,'-A','trust','-U','entrance_test','--no-locale']);await exec('pg_ctl',['-D',cluster,'-l',join(root,'pg.log'),'-o',`-p 51948 -h 127.0.0.1 -k ${root}`,'-w','start']);started=true;
 const pool=new Pool({connectionString:url});try{for(const migration of (await readdir('prisma/migrations')).sort())if(migration!=='migration_lock.toml')await pool.query(await readFile('prisma/migrations/'+migration+'/migration.sql','utf8'));}finally{await pool.end();}
 prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url})});await prisma.restaurant.create({data:{id:'restaurant',name:'Cocotte',settings:{create:{}}}});
 const passwordHash=await hashPassword(secret);
 await prisma.user.create({data:{id:'entrance-admin',restaurantId:'restaurant',name:'Test administrator',email:'entrance-admin@example.test',passwordHash,role:'SUPER_USER'}});
 await prisma.user.create({data:{id:'entrance-viewer',restaurantId:'restaurant',name:'Recipe viewer',email:'entrance-viewer@example.test',passwordHash,role:'CHEF',accessRole:'VIEWER',permissionOverrides:Object.fromEntries(ALL_PERMISSIONS.map(p=>[p,p==='recipes.view']))}});
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3183'],{env:{...process.env,DATABASE_URL:url,ZONAL_AGENT_UPLOAD_ENABLED:'false'},stdio:'ignore'});
 for(let n=0;n<100;n++){try{if((await fetch(base+'/login')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors:string[]=[],stages:string[]=[];
 page.on('pageerror',()=>errors.push('Browser runtime error'));
 await page.addInitScript(()=>{
  const probe={contexts:0,tones:0,noise:0,resumes:0,closes:0,activeLoops:0,state:'none'};(window as typeof window&{__entranceAudioProbe:typeof probe}).__entranceAudioProbe=probe;
  const Native=window.AudioContext;if(!Native)return;
  const seen=new WeakSet<AudioContext>(),gain=Native.prototype.createGain,oscillator=Native.prototype.createOscillator,buffer=Native.prototype.createBufferSource,resume=Native.prototype.resume,close=Native.prototype.close;
  Native.prototype.createGain=function(){if(!seen.has(this)){seen.add(this);probe.contexts++;probe.state=this.state;this.addEventListener('statechange',()=>{probe.state=this.state;});}return gain.call(this);};
  Native.prototype.createOscillator=function(){probe.tones++;return oscillator.call(this);};
  Native.prototype.createBufferSource=function(){probe.noise++;const source=buffer.call(this),start=source.start;let counted=false;source.start=function(...args:Parameters<AudioBufferSourceNode['start']>){if(source.loop){counted=true;probe.activeLoops++;}return start.apply(source,args);};source.addEventListener('ended',()=>{if(counted)probe.activeLoops--;});return source;};
  Native.prototype.resume=function(){probe.resumes++;return resume.call(this);};
  Native.prototype.close=function(){probe.closes++;return close.call(this);};
 });

 await page.goto(base+'/login');await expect(page.getByLabel('Email address',{exact:true})).toBeVisible();await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
 await expect(page.getByText('Behind every great kitchen.',{exact:true})).toBeVisible();await expect(page.getByText('Smarter decisions start here.',{exact:true})).toBeVisible();assert.equal(await page.locator('.entrance-controls').count(),0);
 await page.screenshot({path:join(screens,'desktop-idle.png')});
 await page.keyboard.press('Tab');await expect(page.getByLabel('Email address',{exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByLabel('Password',{exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Show password',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Enter Cocotte'})).toBeFocused();

 step='responsive layouts';
 for(const width of [375,390,768,1440]){
  await page.setViewportSize({width,height:width<768?844:900});await expect(page.locator('.cinematic-login')).toHaveAttribute('data-stage','idle');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await expect(page.getByRole('button',{name:'Enter Cocotte'})).toBeVisible();
  await page.screenshot({path:join(screens,`idle-${width}.png`)});
 }
 step='rejected login';await page.getByLabel('Email address',{exact:true}).fill('entrance-admin@example.test');await page.getByLabel('Password',{exact:true}).fill('wrong-fixture-only');await page.getByRole('button',{name:'Enter Cocotte'}).click();
 await expect(page.locator('.cinematic-login')).toHaveAttribute('data-stage','rejected');await expect(page.locator('#entrance-feedback')).toHaveText('ACCESS DENIED — Incorrect email or password.');assert.equal(await prisma.session.count(),0);await expect(page).toHaveURL(/login/);
 assert(await page.locator('.door-leaf').evaluate(e=>Math.abs(new DOMMatrix(getComputedStyle(e).transform).m11-1)<.001));await page.waitForTimeout(300);await page.screenshot({path:join(screens,'desktop-rejected.png')});
 step='continuous emergency siren, field-edit and tab cleanup';
 await expect.poll(()=>page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{noise:number}}).__entranceAudioProbe.noise)).toBeGreaterThanOrEqual(1);
 assert.equal(await page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{activeLoops:number}}).__entranceAudioProbe.activeLoops),1);
 const beforeRepeat=await page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{noise:number}}).__entranceAudioProbe.noise);await page.waitForTimeout(1700);
 assert.equal(await page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{noise:number}}).__entranceAudioProbe.noise),beforeRepeat); // One audio-clock loop; no repeated allocations.
 assert.equal(await page.locator('.door-leaf').evaluate(el=>getComputedStyle(el).animationName),'door-security-shake');
 assert.equal(await page.locator('.door-status-light').evaluate(el=>getComputedStyle(el).animationDuration),'1.2s');
 await page.getByLabel('Email address',{exact:true}).fill('entrance-admin@example.test ');await expect(page.locator('.cinematic-login')).toHaveAttribute('data-stage','typing');
 assert.equal(await page.locator('.door-leaf').evaluate(el=>getComputedStyle(el).animationName),'none');
 await expect.poll(()=>page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{activeLoops:number}}).__entranceAudioProbe.activeLoops)).toBe(0);
 const stopped=await page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{noise:number}}).__entranceAudioProbe.noise);await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{noise:number}}).__entranceAudioProbe.noise),stopped);
 await page.getByLabel('Email address',{exact:true}).fill('entrance-admin@example.test');await page.getByLabel('Password',{exact:true}).fill('wrong-fixture-only');await page.getByRole('button',{name:'Enter Cocotte'}).click();await expect(page.locator('.cinematic-login')).toHaveAttribute('data-stage','rejected');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.cinematic-login')).toHaveAttribute('data-stage','idle');
 await expect.poll(()=>page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{activeLoops:number}}).__entranceAudioProbe.activeLoops)).toBe(0);
 const hidden=await page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{noise:number}}).__entranceAudioProbe.noise);await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{noise:number}}).__entranceAudioProbe.noise),hidden);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.getByLabel('Password',{exact:true}).fill('');
 step='retry and password control';await page.getByLabel('Password',{exact:true}).fill(secret);await expect(page.locator('.cinematic-login')).toHaveAttribute('data-stage','typing');await page.getByRole('button',{name:'Show password',exact:true}).click();await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');await page.getByRole('button',{name:'Hide password',exact:true}).click();
 await page.exposeFunction('recordEntranceStage',(stage:string)=>stages.push(stage));
 await page.evaluate(()=>{const el=document.querySelector('.cinematic-login')!;new MutationObserver(()=>{void (window as typeof window&{recordEntranceStage:(s:string)=>Promise<void>}).recordEntranceStage(el.getAttribute('data-stage')!);}).observe(el,{attributes:true,attributeFilter:['data-stage']});});
 step='server-confirmed animation';const submittedAt=Date.now();await page.getByRole('button',{name:'Enter Cocotte'}).click();await expect(page.locator('.cinematic-login')).toHaveAttribute('data-stage',/accepted|opening/,{timeout:15000});
 assert.equal(await prisma.session.count(),1);assert.equal(await page.getByRole('button',{name:'Skip entrance animation'}).count(),0);
 await expect(page.locator('.cinematic-login')).toHaveAttribute('data-stage','opening');await page.waitForTimeout(500);
 assert(await page.locator('.door-leaf').evaluate(e=>Math.abs(new DOMMatrix(getComputedStyle(e).transform).m11)<.99));await page.screenshot({path:join(screens,'desktop-door-opening.png')});
 await expect(page.locator('.cinematic-login')).toHaveAttribute('data-stage','entering');await page.waitForTimeout(350);await page.screenshot({path:join(screens,'desktop-entering.png')});await expect(page).toHaveURL(/dashboard/);
 assert(stages.includes('accepted')&&stages.includes('opening')&&stages.includes('entering'));assert((await page.evaluate(()=>(window as typeof window&{__entranceAudioProbe:{noise:number}}).__entranceAudioProbe.noise))>=6);assert(Date.now()-submittedAt<10000);await page.goto(base+'/login');await expect(page).toHaveURL(/dashboard/);
 step='mobile keyboard-sized viewport';const phone=await browser.newContext({...devices['iPhone 13'],deviceScaleFactor:1}),mobile=await phone.newPage();await mobile.goto(base+'/login');await mobile.getByLabel('Email address',{exact:true}).focus();await mobile.setViewportSize({width:390,height:460});
 await expect.poll(async()=>{const box=await mobile.getByRole('button',{name:'Enter Cocotte'}).boundingBox();return !!box&&box.y>=0&&box.y+box.height<=460;}).toBe(true);await mobile.setViewportSize({width:390,height:844});await mobile.screenshot({path:join(screens,'iphone-idle.png')});await phone.close();
 step='mobile permitted viewer landing';const viewer=await browser.newPage({viewport:{width:390,height:844}});await viewer.goto(base+'/login');await viewer.getByLabel('Email address',{exact:true}).fill('entrance-viewer@example.test');await viewer.getByLabel('Password',{exact:true}).fill(secret);await viewer.getByRole('button',{name:'Enter Cocotte'}).click();await expect(viewer).toHaveURL(/recipes/);
 step='reduced motion';const reducedContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await reducedContext.addInitScript(()=>{(window as typeof window&{audioAttempts:number}).audioAttempts=0;const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(){super();(window as typeof window&{audioAttempts:number}).audioAttempts++;}};});
 const reduced=await reducedContext.newPage();await reduced.goto(base+'/login');await reduced.getByLabel('Email address',{exact:true}).fill('entrance-viewer@example.test');await reduced.getByLabel('Password',{exact:true}).fill('wrong-fixture-only');await reduced.getByRole('button',{name:'Enter Cocotte'}).click();await expect(reduced.locator('.cinematic-login')).toHaveAttribute('data-stage','rejected');assert.equal(await reduced.locator('.door-status-light').evaluate(el=>getComputedStyle(el).animationName),'none');assert.equal(await reduced.evaluate(()=>(window as typeof window&{audioAttempts:number}).audioAttempts),0);await reduced.screenshot({path:join(screens,'reduced-motion-warning.png')});
 await reduced.getByLabel('Password',{exact:true}).fill(secret);await reduced.getByRole('button',{name:'Enter Cocotte'}).click();await expect(reduced).toHaveURL(/recipes/);await reducedContext.close();
 step='network failure stays locked';const offline=await browser.newPage({viewport:{width:390,height:844}});await offline.goto(base+'/login');await offline.getByLabel('Email address',{exact:true}).fill('entrance-viewer@example.test');await offline.getByLabel('Password',{exact:true}).fill(secret);
 await offline.route('**/login',route=>route.request().method()==='POST'?route.abort('failed'):route.continue());await offline.getByRole('button',{name:'Enter Cocotte'}).click();await expect(offline.locator('#entrance-feedback')).toContainText('temporarily unavailable');await expect(offline.locator('.cinematic-login')).toHaveAttribute('data-stage','idle');await offline.close();
 step='unavailable audio never blocks login';const brokenContext=await browser.newContext({viewport:{width:390,height:844}});await brokenContext.addInitScript(()=>{Object.defineProperty(window,'AudioContext',{configurable:true,value:class{constructor(){throw new Error('Unavailable test audio device');}}});Object.defineProperty(window,'webkitAudioContext',{configurable:true,value:undefined});});
 const broken=await brokenContext.newPage();await broken.goto(base+'/login');await broken.getByLabel('Email address',{exact:true}).fill('entrance-viewer@example.test');await broken.getByLabel('Password',{exact:true}).fill(secret);await broken.getByRole('button',{name:'Enter Cocotte'}).click();await expect(broken).toHaveURL(/recipes/);await brokenContext.close();
 assert.deepEqual(errors,[]);assert.equal(await prisma.dailySales.count(),0);assert.equal(await prisma.purchaseInvoice.count(),0);
 console.log('PASS cinematic entrance: 375/390/768/1440px layouts; server-rejected locked door; retry/show-hide; real session before green/opening; visible 3D transform, mist and permitted landing; no sound/skip controls; reduced motion; keyboard-sized viewport; repeating rejection alarm/edit/visibility cleanup, success foley and unavailable-audio fallback; no financial changes. Synthetic accounts and isolated database only.');
 console.log('Review screenshots: '+screens);
}catch(error){console.error('[entrance-check] FAILED',step,error instanceof Error?error.name:'UnknownError');if(error instanceof Error)console.error(error.message.replaceAll(secret,'[redacted]').replaceAll('wrong-fixture-only','[redacted]').slice(0,1400));process.exitCode=1;}
finally{await browser?.close();app?.kill('SIGTERM');await prisma?.$disconnect();if(started)await exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});}
