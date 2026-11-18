// Test-only process: refuses every database except the disposable job-test cluster.
import assert from 'node:assert/strict';
import {db} from '../src/lib/db';
import {salesWorkerTick,type SalesJobDependencies} from '../src/lib/sales-sync/job-worker';
const url=new URL(process.env.DATABASE_URL??'');assert.equal(url.port,'51953');assert.equal(url.username,'jobs_test');
export function report(date:string){return {branch:'003 – Parsons Green' as const,date,currency:'GBP' as const,gross:'120.00',discount:'0.00',vat:'20.00',net:'100.00',food:'70.00',drink:'20.00',specials:'10.00',covers:'5',transactions:'10'};}
let count=0;
const deps:SalesJobDependencies={
 latest:async()=>({code:'REPORT_EXTRACTED',loginVerified:true,report:report('2026-11-12')}),
 batch:async(_restaurant,_credentials,dates,onDay)=>{
  for(const date of dates){
   await onDay(date,date==='2026-11-04'&&process.env.FIXTURE_FAIL==='yes'?{code:'REPORT_INVALID',loginVerified:true}:{code:'REPORT_EXTRACTED',loginVerified:true,report:report(date)});
   count++;if(process.env.FIXTURE_CRASH==='yes'&&count===2)process.exit(75);
  }return {code:'AUTHENTICATED',loginVerified:true};
 }
};
const prisma=db();try{await salesWorkerTick(prisma,deps);}finally{await prisma.$disconnect();}
