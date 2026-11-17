// All fixture writes target a new disposable PostgreSQL cluster, never the configured database.
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {Pool} from 'pg';
import {chromium,expect,type Page} from '@playwright/test';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {hashPassword} from '../src/lib/password';
const exec=promisify(execFile),root=await mkdtemp(join(tmpdir(),'cocotte-recipe-archive-')),cluster=join(root,'postgres');
let started=false,app:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const url='postgresql://recipe_archive@127.0.0.1:51949/postgres',base='http://localhost:3184';
const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:3})}),pool=new Pool({connectionString:url});
const password=randomBytes(24).toString('base64url');let poolClosed=false,log='';
async function startApp(){app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3184'],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:url,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});app.stdout?.on('data',data=>{log+=String(data);});app.stderr?.on('data',data=>{log+=String(data);});await expect.poll(async()=>{try{return (await fetch(base+'/login')).status;}catch{return 0;}},{timeout:30000}).toBe(200);}
async function stopApp(){if(app&&app.exitCode===null){const process=app;await new Promise<void>(resolve=>{process.once('exit',()=>resolve());process.kill('SIGTERM');setTimeout(resolve,5000);});}app=undefined;}
async function login(page:Page,email:string){await page.goto(base+'/login');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in to your kitchen'}).click();await expect(page).toHaveURL(/dashboard/);}
try{
 await exec('initdb',['-D',cluster,'-A','trust','-U','recipe_archive','--no-locale']);
 await exec('pg_ctl',['-D',cluster,'-l',join(root,'postgres.log'),'-o',`-p 51949 -h 127.0.0.1 -k ${root}`,'-w','start']);started=true;
 for(const dir of (await readdir('prisma/migrations')).sort())if(dir!=='migration_lock.toml')await pool.query(await readFile('prisma/migrations/'+dir+'/migration.sql','utf8'));
 await pool.end();poolClosed=true;
 await prisma.restaurant.create({data:{id:'restaurant',name:'Recipe Archive Test',settings:{create:{}}}});
 for(const [id,role] of [['admin','SUPER_USER'],['chef','CHEF']] as const)await prisma.user.create({data:{id,email:id+'@archive.test',role,name:id,passwordHash:await hashPassword(password),restaurantId:'restaurant'}});
 const type=await prisma.recipeType.create({data:{restaurantId:'restaurant',name:'Preparations'}});
 const recipe=await prisma.recipe.create({data:{id:'archive-fixture',restaurantId:'restaurant',typeId:type.id,name:'Archive Sauce',ingredients:[{name:'Olive oil',quantity:'0.25',unit:'Lt'}],beforeService:'1. Keep this instruction exactly.',onOrder:'Finish as recorded.',allergens:'Mustard',suitability:'Recorded suitability',imageMime:'image/png',imageBytes:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')}});
 const parent=await prisma.recipe.create({data:{restaurantId:'restaurant',typeId:type.id,name:'Parent Dish',ingredients:[]}});
 await prisma.recipeComponent.create({data:{restaurantId:'restaurant',recipeId:parent.id,componentId:recipe.id}});
 await prisma.weeklySpecial.create({data:{restaurantId:'restaurant',recipeId:recipe.id,status:'PUBLISHED'}});
 await prisma.recipeFeatureSettings.create({data:{restaurantId:'restaurant',weeklySpecialsEnabled:true}});
 const original=async()=>{const {archivedAt,...content}=await prisma.recipe.findUniqueOrThrow({where:{id:recipe.id}});void archivedAt;return content;};const before=await original();
 await startApp();browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page,'admin@archive.test');await page.goto(base+'/recipes');
 const card=()=>page.locator('section[aria-label="Recipe library"] .recipe-card').filter({has:page.getByRole('link',{name:recipe.name,exact:true})});
 await card().locator('summary').click();page.once('dialog',async d=>{assert.equal(d.message(),'Are you sure you want to archive this recipe? You can restore it later.');await d.dismiss();});await card().getByRole('button',{name:'Delete',exact:true}).click();assert.equal((await prisma.recipe.findUniqueOrThrow({where:{id:recipe.id}})).archivedAt,null);
 page.once('dialog',d=>d.accept());await card().getByRole('button',{name:'Delete',exact:true}).click();await expect(page).toHaveURL(/notice=archived/);await expect(page.getByRole('status')).toContainText('Recipe archived successfully');await expect(card()).toHaveCount(0);
 assert((await prisma.recipe.findUniqueOrThrow({where:{id:recipe.id}})).archivedAt);assert.deepEqual(await original(),before);assert.equal(await prisma.recipeComponent.count({where:{componentId:recipe.id}}),1);assert.equal(await prisma.weeklySpecial.count({where:{recipeId:recipe.id}}),1);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});await page.goto(base+'/recipes?tab=archived');await expect(page.getByRole('link',{name:recipe.name,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Restore Recipe',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Restore Recipe',exact:true})).toBeInViewport();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.waitForTimeout(300);await page.screenshot({path:`/tmp/cocotte-recipe-archive-${width}.png`,fullPage:true});}
 await page.getByRole('textbox',{name:'Search recipes'}).fill('Archive Sauce');await page.getByRole('combobox',{name:'Recipe type'}).selectOption(type.id);await page.getByRole('combobox',{name:'Sort archived recipes'}).selectOption('name');await page.getByRole('button',{name:'FILTER',exact:true}).click();await expect(page.getByRole('link',{name:recipe.name,exact:true})).toBeVisible();
 await page.goto(base+'/recipes/edit');await expect(page.getByLabel('Add Component Recipe').locator('option[value="'+recipe.id+'"]')).toHaveCount(0);
 await page.goto(base+'/recipes/edit?id='+parent.id);await expect(page.getByText('Archived · existing link')).toBeVisible();await expect(page.getByLabel('Add Component Recipe').locator('option[value="'+recipe.id+'"]')).toHaveCount(0);
 await page.goto(base+'/recipes/'+recipe.id);await expect(page.getByText('Archived recipe',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'EDIT RECIPE'})).toHaveCount(0);
 // New browser session + fresh server process establish that archive state lives in PostgreSQL.
 await context.close();await stopApp();await startApp();const fresh=await browser.newContext(),restoredPage=await fresh.newPage();await login(restoredPage,'admin@archive.test');await restoredPage.goto(base+'/recipes?tab=archived');await expect(restoredPage.getByRole('link',{name:recipe.name,exact:true})).toBeVisible();
 const chefContext=await browser.newContext(),chef=await chefContext.newPage();await login(chef,'chef@archive.test');await chef.goto(base+'/recipes?tab=archived');await expect(chef.getByRole('button',{name:'Restore Recipe'})).toHaveCount(0);await expect(chef.getByRole('link',{name:recipe.name,exact:true})).toHaveCount(0);await chef.goto(base+'/recipes/'+parent.id);await chef.getByText('Components & Preparations').click();await expect(chef.getByText('Archived · retained reference')).toBeVisible();await chefContext.close();
 await restoredPage.getByRole('button',{name:'Restore Recipe',exact:true}).click();await expect(restoredPage).toHaveURL(/notice=restored/);await expect(restoredPage.getByRole('status')).toContainText('Recipe restored successfully');await expect(restoredPage.locator('section[aria-label="Recipe library"]').getByRole('link',{name:recipe.name,exact:true})).toBeVisible();assert.deepEqual(await original(),before);assert.equal((await prisma.recipe.findUniqueOrThrow({where:{id:recipe.id}})).archivedAt,null);assert.equal(await prisma.auditLog.count({where:{entityId:recipe.id,action:{in:['RECIPE_ARCHIVED','RECIPE_RESTORED']}}}),2);assert.deepEqual(errors,[]);
 console.log('PASS: real archive confirmation/cancellation, active removal, archive badge/table/search/filter/sort, 390/768/1440px, read-only detail, excluded new component choices, retained historical links/specials, Chef permissions, persistence across browser session and app restart, restore with exact recipe/photo preservation and audit trail. Only disposable fixture data used.');
}catch(error){console.error('Isolated browser test failed. Server diagnostics:',log);throw error;}
finally{await browser?.close();await stopApp();if(!poolClosed)await pool.end();await prisma.$disconnect();if(started)await exec('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);await rm(root,{recursive:true,force:true});}
