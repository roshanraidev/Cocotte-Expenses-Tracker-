import { describe,expect,it } from 'vitest';
import { assessPreview,type ApprovalContext,type PreviewRecord } from '@/lib/zonal/approval';
import { resolveSalesSources } from '@/lib/zonal/sales-source';
const date=new Date('2026-11-03T00:00:00Z'),now=new Date('2026-11-06T12:00:00Z');
const report={branch:'003 – Parsons Green',date:'2026-11-03',currency:'GBP',gross:'12000',discount:'0',vat:'2000',net:'10000',food:'7000',drink:'2000',specials:'1000',covers:12,transactions:38};
const record:PreviewRecord={id:'preview',date,status:'PREVIEW',createdAt:now,payload:report,fingerprint:'hash',salesVersion:0};
const context:ApprovalContext={branch:report.branch,currency:'GBP',today:'2026-11-06',now,week:{finalizedAt:null,dayCount:7},sale:null,newestId:record.id};
describe('actionable approval readiness',()=>{
 it('links a missing forecast to the correct Monday–Sunday weekly plan',()=>{
  const result=assessPreview(record,{...context,week:null});
  expect(result.canApprove).toBe(false);expect(result.monday).toBe('2026-11-02');expect(result.weekEnd).toBe('2026-11-08');
  expect(result.issues).toContainEqual(expect.objectContaining({code:'MISSING_FORECAST',href:'/admin/planning?week=2026-11-02'}));
 });
 it('keeps finalization locked and links to the existing audited reopening workflow',()=>{
  const result=assessPreview(record,{...context,week:{finalizedAt:now,dayCount:7}});
  expect(result.canApprove).toBe(false);expect(result.issues[0]).toMatchObject({code:'FINALIZED_WEEK',href:'/reports?week=2026-11-02&tab=purchasing'});
 });
 it('reports all blockers, including expiry, rather than hiding a missing plan',()=>{
  const result=assessPreview({...record,createdAt:new Date(0)},{...context,week:null});
  expect(result.state).toBe('expired');expect(result.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['EXPIRED','MISSING_FORECAST']));
 });
 it('marks a fresh valid preview ready and requires no replacement confirmation',()=>{
  const result=assessPreview(record,context);expect(result.state).toBe('ready');expect(result.canApprove).toBe(true);expect(result.conflict).toBe(false);
 });
 it('requires explicit correction approval for an existing sales value',()=>{
  const result=assessPreview({...record,salesVersion:2},{...context,sale:{version:2,amountPence:9000n}});
  expect(result.state).toBe('correction');expect(result.canApprove).toBe(true);expect(result.conflict).toBe(true);expect(result.reasonRequired).toBe(true);
 });
 it('blocks a duplicate approved report and stale sales revisions',()=>{
  const duplicate=assessPreview(record,{...context,priorFingerprint:'hash',sale:{version:1,amountPence:10000n}});
  expect(duplicate.canApprove).toBe(false);expect(duplicate.issues.some(i=>i.code==='DUPLICATE')).toBe(true);
  expect(assessPreview(record,{...context,sale:{version:2,amountPence:9000n}}).issues.some(i=>i.code==='STALE_SALES')).toBe(true);
 });
 it('directs older previews to the newest copy without deleting or approving them',()=>{
  const result=assessPreview(record,{...context,newestId:'latest'});
  expect(result.state).toBe('superseded');expect(result.issues).toContainEqual(expect.objectContaining({code:'SUPERSEDED',href:'#preview-latest'}));
 });
 it('fails closed for malformed payloads and incomplete forecasts',()=>{
  const result=assessPreview({...record,payload:{net:'unreadable'}},context);
  expect(result.report).toBeNull();expect(result.canApprove).toBe(false);expect(result.issues[0].code).toBe('VALIDATION_FAILED');
  expect(assessPreview(record,{...context,week:{finalizedAt:null,dayCount:6}}).issues[0].code).toBe('INCOMPLETE_FORECAST');
 });
});
const approved={id:'import',restaurantId:'r1',date,status:'APPROVED',source:'ZONAL_BROWSER',completedAt:now,salesVersion:0,branch:report.branch,payload:report};
const sale={restaurantId:'r1',date,version:1,amountPence:10000n};
describe('dashboard sales provenance',()=>{
 it('shows approved matching Daily Sales as Zonal, with report date and approval time',()=>{
  expect(resolveSalesSources('r1',[sale],[approved]).get('2026-11-03')).toMatchObject({importId:'import',reportDate:'2026-11-03',approvedAt:now,netPence:10000n});
 });
 it('never shows unapproved previews or labels a later manual correction as Zonal',()=>{
  expect(resolveSalesSources('r1',[sale],[{...approved,status:'PREVIEW'}]).size).toBe(0);
  expect(resolveSalesSources('r1',[{...sale,version:3}],[approved]).size).toBe(0);
  expect(resolveSalesSources('r1',[{...sale,amountPence:9000n}],[approved]).size).toBe(0);
 });
 it('isolates sources by restaurant and never falls back to an older import after a correction',()=>{
  expect(resolveSalesSources('r2',[sale],[approved]).size).toBe(0);
  const newer={...approved,id:'newer',completedAt:new Date(now.getTime()+1000),salesVersion:2};
  expect(resolveSalesSources('r1',[sale],[approved,newer]).size).toBe(0);
 });
});
