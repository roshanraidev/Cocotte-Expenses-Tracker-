import { describe,expect,it,vi,beforeEach,afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
vi.mock('server-only',()=>({}));
import { parseFinancialDetail } from '@/lib/zonal/financial-parser.mjs';
import { validateReport } from '@/lib/zonal/validation';
import { fetchAndPreview } from '@/lib/zonal/service';
import { encryptCredentials } from '@/lib/zonal/crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { extractedReportSchema, type LoginResult } from '@/lib/zonal/worker';
const branch='003 – Parsons Green',date='2026-11-03';
const headings=['Sales Departments','Quantity','Gross Sales Incl Disc','Discount','Gross Sales','VAT','Net Sales','% Of Total','Cost','Cost %'];
// Synthetic financial amounts. Structure comes from the live-observed report, not seeded business data.
const fixture=[
 'Financial Detail','Synthetic Kitchen','Date Range: 03 Nov 2026 - 03 Nov 2026','Branch: 003 - Parsons Green',
 'Gross Sales Incl Disc','£140.00','Covers','12','Transaction Count','38','Discount','£20.00','Gross Sales','£120.00','VAT','£20.00','Net Sales','£100.00','Sales Type',
 ...headings,
 'Drink','1','£24.00','£0.00','£24.00','£4.00','£20.00','20.00%','£999.00','999.00%',
 'Food','1','£104.00','£20.00','£84.00','£14.00','£70.00','70.00%','£999.00','999.00%',
 'SPECIALS','1','£12.00','£0.00','£12.00','£2.00','£10.00','10.00%','£999.00','999.00%',
 'Totals','3','£140.00','£20.00','£120.00','£20.00','£100.00','100.00%','£999.00','999.00%','Media','Page 1 of 1',
].join('\n');
const raw=()=>parseFinancialDetail(fixture,branch,date);
describe('verified Financial Detail layout',()=>{
 it('extracts every requested figure and ignores Zonal Cost %',()=>{
  expect(raw()).toEqual({branch,date,currency:'GBP',gross:'120.00',discount:'20.00',vat:'20.00',net:'100.00',food:'70.00',drink:'20.00',specials:'10.00',covers:'12',transactions:'38'});
  expect(validateReport(raw(),branch,date).net).toBe('10000');
 });
 it('handles non-zero discounts without subtracting them twice',()=>{
  const report=validateReport(raw(),branch,date);expect(report.gross).toBe('12000');expect(report.discount).toBe('2000');expect(report.net).toBe('10000');
 });
 it.each([
  ['branch',fixture.replace('Branch: 003 - Parsons Green','Branch: 004 - Other')],
  ['date',fixture.replace('03 Nov 2026 - 03 Nov 2026','02 Nov 2026 - 03 Nov 2026')],
  ['currency',fixture.replace('£120.00','€120.00')],
  ['missing field',fixture.replace('Transaction Count\n38','Transaction Count\n')],
  ['missing department',fixture.replace('SPECIALS','Unexpected')],
  ['changed headers',fixture.replace('Quantity\nGross Sales Incl Disc','Quantity\nUnknown column')],
  ['multi-page',fixture.replace('Page 1 of 1','Page 1 of 2')],
  ['summary mismatch',fixture.replace('£140.00','£150.00')],
  ['department mismatch',fixture.replace('£70.00\n70.00%','£71.00\n70.00%')],
 ])('rejects %s without inventing values',(_name,text)=>{expect(()=>parseFinancialDetail(text,branch,date)).toThrow();});
 it('rejects unauthorised mappings and absent report content',()=>{
  expect(()=>parseFinancialDetail(fixture,'004 - Other',date)).toThrow('UNAUTHORISED');expect(()=>parseFinancialDetail('Loading…',branch,date)).toThrow('TITLE');
 });
});
const actor={id:'admin',restaurantId:'restaurant',role:'SUPER_USER' as const};
beforeEach(()=>vi.stubEnv('ZONAL_CREDENTIALS_KEY',randomBytes(32).toString('base64')));
afterEach(()=>vi.unstubAllEnvs());
function database(){
 const connection={restaurantId:actor.restaurantId,branch,revision:1,encryptedCredentials:encryptCredentials(actor.restaurantId,{username:'fixture',password:'fixture'}),lastAttemptAt:new Date(0)};
 const tx={
  $queryRaw:vi.fn(),restaurant:{findUniqueOrThrow:vi.fn().mockResolvedValue({currency:'GBP'})},
  zonalConnection:{findUnique:vi.fn(async({where}:{where:{restaurantId:string}})=>where.restaurantId===actor.restaurantId?connection:null),upsert:vi.fn(async()=>{connection.revision++;return {...connection};}),updateMany:vi.fn(async({where}:{where:{revision:number}})=>({count:where.revision===connection.revision&&connection.encryptedCredentials?1:0}))},
  dailySales:{findUnique:vi.fn().mockResolvedValue({version:3,amountPence:123n}),create:vi.fn(),update:vi.fn()},
  zonalImport:{create:vi.fn().mockResolvedValue({id:'preview-browser'})},auditLog:{create:vi.fn()},
 };
 return {tx,connection,prisma:{...tx,$transaction:async(fn:(t:unknown)=>unknown)=>fn(tx)} as unknown as PrismaClient};
}
const runner=async():Promise<LoginResult>=>({code:'REPORT_EXTRACTED',loginVerified:true,report:extractedReportSchema.parse(raw())});
describe('live fetch to preview safety',()=>{
 it('stores browser source and extracted values without writing Daily Sales',async()=>{
  const {prisma,tx}=database();expect(await fetchAndPreview(prisma,actor,date,runner)).toBe('preview-browser');
  expect(tx.zonalImport.create.mock.calls[0][0].data).toMatchObject({source:'ZONAL_BROWSER',restaurantId:actor.restaurantId,salesVersion:3,previousPence:123n,payload:{net:'10000',covers:12,transactions:38}});
  expect(tx.dailySales.update).not.toHaveBeenCalled();expect(tx.dailySales.create).not.toHaveBeenCalled();
 });
 it('refuses chefs, foreign restaurants, future dates and unverified extraction',async()=>{
  const {prisma,tx}=database();const browser=vi.fn(runner);
  await expect(fetchAndPreview(prisma,{...actor,role:'CHEF'},date,browser)).rejects.toThrow('Super User');
  await expect(fetchAndPreview(prisma,{...actor,restaurantId:'other'},date,browser)).rejects.toThrow('Map');
  await expect(fetchAndPreview(prisma,actor,'2099-01-01',browser)).rejects.toThrow('future');
  expect(browser).not.toHaveBeenCalled();
  await expect(fetchAndPreview(prisma,actor,date,async()=>({code:'REPORT_INVALID',loginVerified:true}))).rejects.toThrow('could not be validated');
  expect(tx.zonalImport.create).not.toHaveBeenCalled();
 });
 it('rejects a wrong requested date even if a worker returns a valid-looking report',async()=>{
  const {prisma,tx}=database();await expect(fetchAndPreview(prisma,actor,'2026-11-02',runner)).rejects.toThrow('date');expect(tx.zonalImport.create).not.toHaveBeenCalled();
 });
 it('discards results if disconnect changes the connection revision before completion',async()=>{
  const {prisma,tx,connection}=database();await expect(fetchAndPreview(prisma,actor,date,async()=>{connection.revision++;return await runner();})).rejects.toThrow('discarded');
  expect(tx.zonalImport.create).not.toHaveBeenCalled();expect(tx.dailySales.update).not.toHaveBeenCalled();
 });
});
