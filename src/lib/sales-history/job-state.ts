export type JobDisplayState='running'|'waiting'|'paused'|'completed'|'failed';
export function jobDisplayState(job:{status:string;leaseUntil:Date|null;activeBatchId:string|null;phase:string;days:{status:string}[]},workerHealthy:boolean,now=Date.now()){
 const pending=job.days.some(d=>d.status==='PENDING'||d.status==='APPROVAL_QUEUED');
 const failures=job.days.filter(d=>['FAILED','UNAVAILABLE','EXCEPTION'].includes(d.status)).length;
 const useful=job.days.some(d=>['STAGED','APPROVED','SKIPPED','APPROVAL_QUEUED'].includes(d.status));
 if(job.status==='PAUSED')return {state:'paused' as JobDisplayState,detail:'Paused. All checkpoints, reports and errors are retained.'};
 if(job.status==='RUNNING'&&workerHealthy&&job.leaseUntil&&job.leaseUntil.getTime()>now)return {state:'running' as JobDisplayState,detail:job.phase==='APPROVE'?'Applying explicit approval.':'Reading and validating reports.'};
 if(['RUNNING','QUEUED'].includes(job.status))return {state:'waiting' as JobDisplayState,detail:!workerHealthy?'Worker offline; checkpoints are retained.':job.status==='RUNNING'?'Waiting for recovery of an expired worker lease.':job.leaseUntil&&job.leaseUntil.getTime()>now?`Waiting until ${job.leaseUntil.toISOString()} before the next bounded batch.`:'Waiting for the worker or another sales batch.'};
 if(!pending&&failures&&!useful)return {state:'failed' as JobDisplayState,detail:'No valid reports were retrieved. Inspect the recorded errors before retrying.'};
 return {state:'completed' as JobDisplayState,detail:pending?'Retrieval stopped with unresolved dates; review the preserved checkpoints.':job.days.some(d=>d.status==='STAGED')?'Retrieval finished. Validated reports still require approval.':failures?'Finished with exceptions requiring review.':'All requested dates are resolved.'};
}
