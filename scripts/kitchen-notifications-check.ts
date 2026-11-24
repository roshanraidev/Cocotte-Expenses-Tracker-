// Disposable PostgreSQL and local browser only. Never uses real accounts or Zonal.
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Pool} from 'pg';
import {chromium,expect} from '@playwright/test';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readdir,readFile,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/lib/password';
import {ALL_PERMISSIONS} from '../src/lib/permissions';
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'cocotte-library-')),cluster=join(root,'pg'),screens='/private/tmp/cocotte-kitchen-notifications-review';
const url='postgresql://entrance_test@127.0.0.1:51959/postgres';
if(url===process.env.DATABASE_URL)throw new Error('Isolated database required.');
let started=false,app:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,prisma:PrismaClient|undefined,step='setup';
const vapid=(await import('web-push')).generateVAPIDKeys();
const secret=randomBytes(24).toString('base64url'),base='http://localhost:3193';
try{
 await mkdir(screens,{recursive:true});await exec('initdb',['-D',cluster,'-A','trust','-U','entrance_test','--no-locale']);await exec('pg_ctl',['-D',cluster,'-l',join(root,'pg.log'),'-o',`-p 51959 -h 127.0.0.1 -k ${root}`,'-w','start']);started=true;
 const pool=new Pool({connectionString:url});try{for(const migration of (await readdir('prisma/migrations')).sort())if(migration!=='migration_lock.toml')await pool.query(await readFile('prisma/migrations/'+migration+'/migration.sql','utf8'));}finally{await pool.end();}
 prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url})});await prisma.restaurant.create({data:{id:'restaurant',name:'Cocotte',settings:{create:{}}}});
 const passwordHash=await hashPassword(secret);
 await prisma.user.create({data:{id:'entrance-admin',restaurantId:'restaurant',name:'Test administrator',email:'entrance-admin@example.test',passwordHash,role:'SUPER_USER'}});
 await prisma.user.create({data:{id:'entrance-viewer',restaurantId:'restaurant',name:'Recipe viewer',email:'entrance-viewer@example.test',passwordHash,role:'CHEF',accessRole:'VIEWER',permissionOverrides:Object.fromEntries(ALL_PERMISSIONS.map(p=>[p,p==='recipes.view']))}});
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3193'],{env:{...process.env,DATABASE_URL:url,ZONAL_AGENT_UPLOAD_ENABLED:'false',WEB_PUSH_VAPID_PUBLIC_KEY:vapid.publicKey,WEB_PUSH_VAPID_PRIVATE_KEY:vapid.privateKey,WEB_PUSH_VAPID_SUBJECT:'mailto:fixture@example.test',NOTIFICATIONS_ENCRYPTION_KEY:randomBytes(32).toString('hex')},stdio:'ignore'});
 for(let n=0;n<100;n++){try{if((await fetch(base+'/login')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 await prisma.recipeType.create({data:{id:'starters',restaurantId:'restaurant',name:'Starters'}});
 await prisma.recipe.createMany({data:Array.from({length:12},(_,i)=>({id:'special-recipe-'+i,restaurantId:'restaurant',typeId:'starters',name:'Special fixture '+String(i+1).padStart(2,'0'),ingredients:[{name:'Unchanged fixture',quantity:'25',unit:'g'}],beforeService:'Original method.'}))});
 const original=await prisma.recipe.findMany({orderBy:{id:'asc'},select:{id:true,name:true,ingredients:true,beforeService:true}});
 browser=await chromium.launch({headless:true});const adminContext=await browser.newContext({viewport:{width:1440,height:1000}}),staffContext=await browser.newContext({viewport:{width:1440,height:1000}}),admin=await adminContext.newPage(),staff=await staffContext.newPage(),errors:string[]=[];
 for(const page of [admin,staff])page.on('pageerror',()=>errors.push('Browser runtime error'));
 async function login(page:typeof admin,email:string){await page.goto(base+'/login');await page.getByLabel('Email address',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(secret);await page.getByRole('button',{name:'Enter Cocotte'}).click();await expect(page).not.toHaveURL(/login/);await page.goto(base+'/recipes');}

 step='signed-in users and authorised live event stream';await login(admin,'entrance-admin@example.test');await login(staff,'entrance-viewer@example.test');await expect(staff.locator('.weekly-specials-rail')).toHaveCount(0);
 await expect(staff.getByRole('link',{name:/Notifications, 12 unread/})).toBeVisible();
 await staff.getByRole('textbox',{name:'Search recipes',exact:true}).fill('fixture 06');await expect(staff.locator('.recipe-card')).toHaveCount(1);
 step='recipe viewer cannot open editor';await secondAuthCheck();
 async function secondAuthCheck(){const deniedPage=await staffContext.newPage();await deniedPage.goto(base+'/recipes/edit');await expect(deniedPage).toHaveURL(/access-denied/);await deniedPage.close();}
 step='database subscription publishes navigation automatically';const publishedAt=Date.now();
 await prisma.$transaction(async tx=>{await tx.recipeFeatureSettings.create({data:{restaurantId:'restaurant',weeklySpecialsEnabled:true}});await tx.weeklySpecial.create({data:{id:'published-special',restaurantId:'restaurant',recipeId:'special-recipe-0',status:'PUBLISHED'}});});
 const nav=staff.locator('.desktop-sidebar .navigation-specials');await expect(nav.getByRole('link',{name:'Special fixture 01',exact:true})).toBeVisible({timeout:6000});const latency=Date.now()-publishedAt;
 await expect(staff.getByRole('textbox',{name:'Search recipes',exact:true})).toHaveValue('fixture 06');
 const recipeNav=staff.locator('.desktop-sidebar nav > a').filter({hasText:'Recipes'});assert.equal(await recipeNav.count(),1);await staff.screenshot({animations:'disabled',path:join(screens,'desktop-navigation.png')});
 step='special changes and removal use committed database notifications';await prisma.weeklySpecial.update({where:{id:'published-special'},data:{recipeId:'special-recipe-1'}});await expect(nav.getByRole('link',{name:'Special fixture 02',exact:true})).toBeVisible({timeout:6000});await expect(nav.getByRole('link',{name:'Special fixture 01',exact:true})).toHaveCount(0);
 await prisma.weeklySpecial.update({where:{id:'published-special'},data:{status:'DRAFT'}});await expect(nav).toHaveCount(0,{timeout:6000});
 step='persistent notification read state across sessions';await staff.goto(base+'/notifications');await expect(staff.locator('.kitchen-notices article')).toHaveCount(15);
 const secondPage=await staffContext.newPage();await secondPage.goto(base+'/notifications');
 const first=staff.locator('.kitchen-notices article').first();await first.getByRole('button',{name:'Mark read',exact:true}).click();await expect(first.getByRole('button',{name:'Mark unread',exact:true})).toBeVisible();await expect(secondPage.locator('.kitchen-notices article').first().getByRole('button',{name:'Mark unread',exact:true})).toBeVisible({timeout:6000});await secondPage.reload();await expect(secondPage.locator('.kitchen-notices article').first().getByRole('button',{name:'Mark unread',exact:true})).toBeVisible();
 step='preferences persist and announcement authorisation';await staff.getByText('Notification preferences',{exact:true}).click();await staff.getByRole('checkbox',{name:'Weekly Specials inApp',exact:true}).uncheck();await expect(staff.locator('.kitchen-notices article')).toHaveCount(12,{timeout:6000});await staff.reload();await staff.getByText('Notification preferences',{exact:true}).click();await expect(staff.getByRole('checkbox',{name:'Weekly Specials inApp',exact:true})).not.toBeChecked();
 const denied=await staff.request.post(base+'/api/kitchen/notifications',{headers:{Origin:base},data:{operation:'announcement',title:'Not allowed',body:'Not allowed',published:true}});assert.equal(denied.status(),403);
 const csrf=await admin.request.post(base+'/api/kitchen/notifications',{headers:{Origin:'https://untrusted.test'},data:{operation:'announcement',title:'Not allowed',body:'Not allowed',published:true}});assert.equal(csrf.status(),403);
 const posted=await admin.request.post(base+'/api/kitchen/notifications',{headers:{Origin:base},data:{operation:'announcement',title:'Service briefing',body:'Fixture briefing only.',published:true}});assert.equal(posted.status(),200);await expect(staff.getByText('Service briefing',{exact:true})).toBeVisible({timeout:6000});
 step='old links cannot open unpublished content';const latest=await prisma.kitchenEvent.findFirst({where:{recipeId:'special-recipe-1'},orderBy:{createdAt:'desc'}});assert(latest);await prisma.recipe.update({where:{id:'special-recipe-1'},data:{visible:false}});await staff.goto(base+'/notifications/open/'+encodeURIComponent(latest.id));await expect(staff.getByRole('heading',{name:'Update no longer available'})).toBeVisible();await prisma.recipe.update({where:{id:'special-recipe-1'},data:{visible:true}});
 step='mobile More contains live weekly specials';await prisma.weeklySpecial.update({where:{id:'published-special'},data:{status:'PUBLISHED'}});await staff.setViewportSize({width:390,height:844});await staff.goto(base+'/recipes');await staff.getByRole('button',{name:'More navigation',exact:true}).click();await expect(staff.locator('#mobile-more .navigation-specials').getByRole('link',{name:'Special fixture 02',exact:true})).toBeVisible({timeout:6000});await staff.screenshot({animations:'disabled',path:join(screens,'mobile-navigation.png')});await staff.getByRole('button',{name:'Close navigation',exact:true}).click();
 step='notification layouts';for(const width of [375,390,768,1440]){await staff.setViewportSize({width,height:900});await staff.goto(base+'/notifications');await expect(staff.locator('.kitchen-notices article').first()).toBeVisible();assert(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===390||width===1440)await staff.screenshot({animations:'disabled',path:join(screens,'notifications-'+width+'.png')});}
 step='durable push fanout and concurrent delivery claims';process.env.DATABASE_URL=url;process.env.NOTIFICATIONS_ENCRYPTION_KEY='cd'.repeat(32);
 const {notices}=await import('../src/lib/kitchen/service'),{resolveAccess}=await import('../src/lib/access');
 const {seal}=await import('../src/lib/kitchen/security'),{notificationTick}=await import('../src/lib/kitchen/worker'),{db}=await import('../src/lib/db');
 const isolatedActor=await resolveAccess(db(),(await prisma.user.findUniqueOrThrow({where:{id:'entrance-viewer'}})));assert.deepEqual(await notices({...isolatedActor,restaurantId:'other-restaurant'}),[]);
 await prisma.kitchenPreference.upsert({where:{userId:'entrance-viewer'},create:{userId:'entrance-viewer',pushEnabled:true},update:{pushEnabled:true}});
 await prisma.kitchenPushSubscription.create({data:{id:'fixture-push',userId:'entrance-viewer',endpointHash:'fixture-endpoint-hash',ciphertext:seal({endpoint:'https://fcm.googleapis.com/fixture',keys:{auth:'fixture',p256dh:'fixture'}})}});
 await prisma.kitchenAnnouncement.create({data:{id:'push-fixture',restaurantId:'restaurant',createdBy:'entrance-admin',title:'Private push fixture',body:'Never sent to the OS.'}});
 let deliveries=0;const send=async(_subscription:unknown,payload?:string|Buffer|null)=>{deliveries++;assert(!String(payload).includes('Private push fixture'));return {statusCode:201,body:'',headers:{}};};
 await Promise.all([notificationTick(send),notificationTick(send)]);await notificationTick(send);assert.equal(deliveries,1);assert.equal(await prisma.kitchenPushDelivery.count({where:{sentAt:{not:null}}}),1);
 await prisma.kitchenPushSubscription.delete({where:{id:'fixture-push'}});
 await prisma.kitchenPushSubscription.create({data:{id:'expired-fixture',userId:'entrance-viewer',endpointHash:'expired-endpoint-hash',ciphertext:seal({endpoint:'https://fcm.googleapis.com/expired-fixture',keys:{auth:'fixture',p256dh:'fixture'}})}});
 await prisma.kitchenAnnouncement.update({where:{id:'push-fixture'},data:{body:'Changed fixture announcement.'}});
 await notificationTick(async()=>{throw Object.assign(new Error('Expired'),{statusCode:410});});assert.equal(await prisma.kitchenPushSubscription.count(),0);await db().$disconnect();
 step='missing migration stays explicit without breaking recipe navigation';await prisma.$executeRawUnsafe('ALTER TABLE "KitchenEvent" RENAME TO "KitchenEvent_fixture_absent"');await staff.goto(base+'/notifications');await expect(staff.getByText('Notifications and real-time updates are awaiting the reviewed kitchen database migration. No database update has been applied.',{exact:true})).toBeVisible();
 assert.deepEqual(await prisma.recipe.findMany({orderBy:{id:'asc'},select:{id:true,name:true,ingredients:true,beforeService:true}}),original);assert.equal(await prisma.dailySales.count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: PostgreSQL LISTEN/NOTIFY navigation, publish/edit/unpublish, two-session notification read state, saved category preferences, CSRF, announcement permissions, protected old links, mobile More, 375/390/768/1440px. No real records changed. Publish-to-render '+latency+' ms. Screenshots: '+screens);
}catch(error){console.error('[specials-check] FAILED',step,error instanceof Error?error.name:'UnknownError');if(error instanceof Error)console.error(error.message.replaceAll(secret,'[redacted]').slice(0,1600));process.exitCode=1;}
finally{await browser?.close();app?.kill('SIGTERM');await prisma?.$disconnect();if(started)await exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});}
