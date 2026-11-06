import { addDays,dateKey,mondayOf,weekLabel } from '../dates';
import { reportInput,validateReport,type Report } from './validation';
export type PreviewRecord={id:string;date:Date;status:string;createdAt:Date;payload:unknown;fingerprint:string;salesVersion:number};
export type ApprovalContext={branch:string;currency:string;today:string;now:Date;week:{finalizedAt:Date|null;dayCount:number}|null;sale:{version:number;amountPence:bigint}|null;priorFingerprint?:string;newestId?:string};
export type ApprovalIssue={code:string;message:string;action:string;href:string;blocking:boolean};
export function assessPreview(record:PreviewRecord,context:ApprovalContext){
 const date=dateKey(record.date),monday=mondayOf(date),week=weekLabel(monday);
 const refresh=`/admin/integrations/zonal?date=${date}#import-centre`;
 const issues:ApprovalIssue[]=[];
 const issue=(code:string,message:string,action:string,href:string,blocking=true)=>issues.push({code,message,action,href,blocking});
 let report:Report|null=null;
 try{report=validateReport(reportInput(record.payload as Report),context.branch,date);}catch{issue('VALIDATION_FAILED','Report validation failed: review the branch, date, currency, missing fields or totals.','Fetch a fresh report',refresh);}
 if(context.currency!=='GBP')issue('CURRENCY','This restaurant is not configured for GBP.','Review integration settings','/admin/integrations/zonal');
 if(date>context.today)issue('FUTURE_DATE','Actual sales cannot be approved for a future date.','Choose a completed date',refresh);
 if(context.now.getTime()-record.createdAt.getTime()>30*60*1000)issue('EXPIRED','This preview has expired after 30 minutes. A fresh report is required.','Fetch this date again',refresh);
 if(!context.week)issue('MISSING_FORECAST',`The weekly forecast is missing for ${week}. Enter the real seven-day forecast before approving sales.`,'Create weekly forecast',`/admin/planning?week=${monday}`);
 else if(context.week.finalizedAt)issue('FINALIZED_WEEK',`The week ${week} is finalized. A Super User must reopen it with an audited reason.`,'Open audited reopening',`/reports?week=${monday}&tab=purchasing`);
 else if(context.week.dayCount!==7)issue('INCOMPLETE_FORECAST',`The forecast for ${week} does not contain all seven days.`,'Review weekly forecast',`/admin/planning?week=${monday}`);
 const duplicate=!!report&&context.priorFingerprint===record.fingerprint&&context.sale?.amountPence===BigInt(report.net);
 if(duplicate)issue('DUPLICATE','Duplicate report: these sales are already imported for this restaurant and date.','View recorded sales',`/sales?date=${date}`);
 else if((context.sale?.version??0)!==record.salesVersion)issue('STALE_SALES','Daily Sales changed after preview. Fetch a fresh report before making a correction.','Refresh this report',refresh);
 else if(context.sale)issue('CORRECTION_REQUIRED','Daily Sales already exists. Replacement requires explicit correction approval and a reason.','Review existing sales',`/sales?date=${date}`,false);
 if(context.newestId&&context.newestId!==record.id)issue('SUPERSEDED','A newer preview exists for this date. Review the newest report to avoid approving an older copy.','Review newest preview',`#preview-${context.newestId}`);
 const canApprove=record.status==='PREVIEW'&&!issues.some(i=>i.blocking);
 const state=issues.some(i=>i.code==='EXPIRED')?'expired':issues.some(i=>i.code==='SUPERSEDED')?'superseded':!canApprove?'blocked':context.sale?'correction':'ready';
 return {date,monday,weekEnd:addDays(monday,6),week,issues,canApprove,state,report,conflict:!!context.sale,reasonRequired:!!context.sale||monday!==mondayOf(context.today)};
}
export type ApprovalAssessment=ReturnType<typeof assessPreview>;
