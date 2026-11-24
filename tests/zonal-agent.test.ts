import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
vi.mock('server-only',()=>({}));
import {localAgentConfig,localDatabaseOnly,receiverConfig} from '@/lib/zonal/agent/config';
import {authenticateAgent} from '@/lib/zonal/agent/auth';
import {AGENT_PATH,BRANCH,digest,transferSchema,productionOrigin,MAX_BODY} from '@/lib/zonal/agent/protocol';
import {boundedJson} from '@/lib/zonal/agent/http';
import {enqueueAgentReport} from '@/lib/zonal/agent/outbox';
import {validateReport} from '@/lib/zonal/validation';
import {uploadNext,retryDelay} from '@/lib/zonal/agent/uploader';
import type {PrismaClient,Prisma} from '@/generated/prisma/client';
const token='a'.repeat(43),hash=createHash('sha256').update(token).digest('hex');
const env={ZONAL_AGENT_ID:'mac-parsons-green-v1',ZONAL_AGENT_TOKEN_SHA256:hash,ZONAL_AGENT_RESTAURANT_ID:'prod-restaurant',ZONAL_AGENT_ACTOR_ID:'prod-admin',ZONAL_AGENT_RECEIVER_ORIGIN:'https://mrcocotte.com'};
const report={branch:BRANCH,date:'2026-11-03',currency:'GBP',gross:'1398.50',discount:'0.00',vat:'230.58',net:'1167.92',food:'945.83',drink:'83.75',specials:'138.33',covers:'12',transactions:'38'};
const transfer={version:1,agentId:env.ZONAL_AGENT_ID,transferId:'123e4567-e89b-42d3-a456-426614174000',sequence:'1',capturedAt:'2026-11-04T10:00:00.000Z',report};
const localEnv={...env,DATABASE_URL:'postgresql://local@127.0.0.1:5432/cocotte',ZONAL_AGENT_UPLOAD_ENABLED:'true',ZONAL_AGENT_LOCAL_RESTAURANT_ID:'local-restaurant',ZONAL_AGENT_KEYCHAIN_ACCOUNT:'cocotte-upload-v1',ZONAL_AGENT_UPLOAD_URL:'https://mrcocotte.com'+AGENT_PATH};
const request=(headers:Record<string,string>={},url='https://mrcocotte.com'+AGENT_PATH)=>new Request(url,{method:'POST',headers:{Authorization:'Bearer '+token,...headers}});
beforeEach(()=>vi.unstubAllEnvs());
describe('upload-only machine authentication and wire protocol',()=>{
 it('requires complete receiver configuration, exact HTTPS origin and a hashed credential',()=>{
  expect(()=>receiverConfig({})).toThrow('RECEIVER_DISABLED');
  expect(()=>receiverConfig({...env,ZONAL_AGENT_TOKEN_SHA256:token})).toThrow();
  expect(()=>authenticateAgent(request(),receiverConfig(env))).not.toThrow();
  for(const headers of ([{Authorization:'Bearer '+ 'b'.repeat(43)},{Authorization:''},{Authorization:'Basic '+token},{Origin:'https://mrcocotte.com'}] as Record<string,string>[]))expect(()=>authenticateAgent(request(headers),receiverConfig(env))).toThrow();
  expect(()=>authenticateAgent(new Request('https://mrcocotte.com'+AGENT_PATH,{headers:{Cookie:'staff-session=anything'}}),receiverConfig(env))).toThrow();
  for(const url of ['http://mrcocotte.com'+AGENT_PATH,'https://www.mrcocotte.com'+AGENT_PATH,'https://mrcocotte.com'+AGENT_PATH+'?token=x'])expect(()=>authenticateAgent(request({},url),receiverConfig(env))).toThrow();
 });
 it('requires explicit proxy trust plus exact public host and HTTPS forwarding',()=>{
  const proxied=new Request('http://127.0.0.1:3000'+AGENT_PATH,{method:'POST',headers:{Host:'mrcocotte.com','X-Forwarded-Proto':'https',Authorization:'Bearer '+token}});
  expect(()=>authenticateAgent(proxied,receiverConfig(env))).toThrow();
  expect(()=>authenticateAgent(proxied,receiverConfig({...env,ZONAL_AGENT_TRUST_PROXY:'true'}))).not.toThrow();
  for(const headers of [{Host:'evil.example','X-Forwarded-Proto':'https'},{Host:'mrcocotte.com','X-Forwarded-Proto':'http'}])expect(()=>authenticateAgent(new Request('http://127.0.0.1:3000'+AGENT_PATH,{method:'POST',headers:{...headers,Authorization:'Bearer '+token}}),receiverConfig({...env,ZONAL_AGENT_TRUST_PROXY:'true'}))).toThrow();
 });
 it('rejects insecure, credential-bearing and arbitrary upload destinations',()=>{
  expect(localAgentConfig(localEnv,'darwin')?.url).toBe(localEnv.ZONAL_AGENT_UPLOAD_URL);
  for(const url of ['http://mrcocotte.com','https://example.test','https://token@mrcocotte.com','https://mrcocotte.com/?token=x'])expect(()=>productionOrigin(url)).toThrow();
  for(const url of ['https://mrcocotte.com/other','https://secret@mrcocotte.com'+AGENT_PATH,'https://mrcocotte.com'+AGENT_PATH+'?token=secret'])expect(()=>localAgentConfig({...localEnv,ZONAL_AGENT_UPLOAD_URL:url},'darwin')).toThrow();
 });
 it('refuses a remote database and cannot enable the Mac uploader on AWS',()=>{
  expect(localAgentConfig({},'darwin')).toBeNull();
  expect(()=>localAgentConfig(localEnv,'linux')).toThrow('MAC_AGENT_REQUIRED');
  for(const value of ['postgres://prod@db.example.test/cocotte','https://localhost','invalid'])expect(()=>localDatabaseOnly(value)).toThrow('LOCAL_DATABASE_REQUIRED');
  expect(()=>localAgentConfig({...localEnv,NODE_TLS_REJECT_UNAUTHORIZED:'0'},'darwin')).toThrow();
 });
 it('accepts exact decimal strings and rejects credentials, local approval flags and missing amounts',()=>{
  expect(transferSchema.parse(transfer).report.net).toBe('1167.92');
  for(const value of [{...transfer,approved:true},{...transfer,password:'secret'},{...transfer,sequence:'0'},{...transfer,report:{...report,net:1167.92}},{...transfer,report:{...report,vat:undefined}}])expect(transferSchema.safeParse(value).success).toBe(false);
  expect(digest(transferSchema.parse(transfer))).toBe(digest(transferSchema.parse(JSON.parse(JSON.stringify(transfer)))));
 });
 it('bounds streaming JSON without trusting Content-Length',async()=>{
  await expect(boundedJson(new Response('x'.repeat(MAX_BODY+1)))).rejects.toThrow('BODY_TOO_LARGE');
  await expect(boundedJson(new Response('{}',{headers:{'content-length':String(MAX_BODY+1)}}))).rejects.toThrow('BODY_TOO_LARGE');
  await expect(boundedJson(new Response('not json'))).rejects.toThrow('INVALID_JSON');
  expect(await boundedJson(new Response(JSON.stringify(transfer)))).toEqual(transfer);
 });
 it('does not queue manual or disabled transfers and converts canonical pence exactly once',async()=>{
  const create=vi.fn();const tx={zonalAgentOutbox:{create}} as unknown as Prisma.TransactionClient;
  await enqueueAgentReport(tx,'local-restaurant',validateReport(report,BRANCH,report.date),new Date());expect(create).not.toHaveBeenCalled();
  for(const [key,value] of Object.entries(localEnv))vi.stubEnv(key,value);
  // Tests run on Mac here; the integration check separately validates transaction rollback.
  if(process.platform==='darwin'){
   await enqueueAgentReport(tx,'foreign-restaurant',validateReport(report,BRANCH,report.date),new Date());expect(create).not.toHaveBeenCalled();
   await enqueueAgentReport(tx,'local-restaurant',validateReport(report,BRANCH,report.date),new Date());expect(create.mock.calls[0][0].data.payload.net).toBe('1167.92');
  }
 });
});
function queueFixture(attempts=1){
 const updateMany=vi.fn().mockResolvedValue({count:1});
 const row={id:transfer.transferId,agentId:transfer.agentId,sequence:1n,capturedAt:new Date(transfer.capturedAt),payload:report,attempts,leaseToken:'lease'};
 const tx={$executeRaw:vi.fn(),zonalAgentOutbox:{count:vi.fn().mockResolvedValue(0),findFirst:vi.fn().mockResolvedValue(row),update:vi.fn().mockResolvedValue(row),updateMany}};
 const prisma={...tx,$transaction:async(fn:(db:typeof tx)=>unknown)=>fn(tx)} as unknown as PrismaClient;
 return {prisma,updateMany};
}
describe('safe transfer retries',()=>{
 it('sends one immutable report with no redirects and acknowledges only a matching receipt',async()=>{
  const {prisma,updateMany}=queueFixture();const fetcher=vi.fn().mockResolvedValue(Response.json({transferId:transfer.transferId,status:'STAGED',previewId:'prod-preview'}));
  expect(await uploadNext(prisma,{agentId:transfer.agentId,url:localEnv.ZONAL_AGENT_UPLOAD_URL},token,fetcher)).toBe('ACKED');
  const init=fetcher.mock.calls[0][1];expect(init.redirect).toBe('manual');expect(init.headers.Authorization).toBe('Bearer '+token);expect(JSON.parse(init.body)).toEqual(transfer);
  expect(updateMany.mock.calls.at(-1)![0]).toMatchObject({where:{leaseToken:'lease'},data:{status:'ACKED'}});
 });
 it('a lost response is retried with the same ID and payload, without a browser login',async()=>{
  const {prisma,updateMany}=queueFixture();const fetcher=vi.fn().mockRejectedValue(new Error('sensitive network details'));
  expect(await uploadNext(prisma,{agentId:transfer.agentId,url:localEnv.ZONAL_AGENT_UPLOAD_URL},token,fetcher)).toBe('RETRY_PENDING');
  expect(JSON.stringify(updateMany.mock.calls)).not.toContain('sensitive');expect(updateMany.mock.calls.at(-1)![0].data.status).toBe('PENDING');
 });
 it.each([301,403,409,422])('blocks unsafe HTTP %s instead of blindly retrying',async status=>{
  const {prisma}=queueFixture();const fetcher=vi.fn().mockResolvedValue(new Response(null,{status}));
  expect(await uploadNext(prisma,{agentId:transfer.agentId,url:localEnv.ZONAL_AGENT_UPLOAD_URL},token,fetcher)).toBe(status===403?'STOPPED':'BLOCKED');
 });
 it('does not trust a successful response with the wrong transfer identity',async()=>{
  const {prisma}=queueFixture();const fetcher=vi.fn().mockResolvedValue(Response.json({transferId:'123e4567-e89b-42d3-a456-426614174001',status:'STAGED',previewId:'other'}));
  expect(await uploadNext(prisma,{agentId:transfer.agentId,url:localEnv.ZONAL_AGENT_UPLOAD_URL},token,fetcher)).toBe('BLOCKED');
 });
 it('bounds exponential backoff and respects server cooldowns',()=>{expect(retryDelay(1)).toBeGreaterThanOrEqual(5000);expect(retryDelay(30)).toBeLessThanOrEqual(3601000);expect(retryDelay(1,'120')).toBeGreaterThanOrEqual(120000);});
});
