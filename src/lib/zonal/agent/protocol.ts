import {createHash} from 'node:crypto';
import {z} from 'zod';
import {validDateKey} from '../../dates';
export const AGENT_PATH='/api/zonal/agent/sales';
export const BRANCH='003 – Parsons Green';
export const MAX_BODY=32768;
export const agentIdSchema=z.string().regex(/^[a-zA-Z0-9_-]{3,80}$/);
const money=z.string().regex(/^\d{1,12}\.\d{2}$/);
const count=z.string().regex(/^(?:|\d{1,9})$/);
export const wireReportSchema=z.object({branch:z.literal(BRANCH),date:z.string().refine(validDateKey),currency:z.literal('GBP'),gross:money,discount:money,vat:money,net:money,food:money,drink:money,specials:money,covers:count,transactions:count}).strict();
export const transferSchema=z.object({version:z.literal(1),agentId:agentIdSchema,transferId:z.uuid(),sequence:z.string().regex(/^[1-9]\d{0,18}$/).refine(v=>BigInt(v)<=9223372036854775807n),capturedAt:z.iso.datetime(),report:wireReportSchema}).strict();
export const receiptSchema=z.object({transferId:z.uuid(),status:z.enum(['STAGED','EXPIRED_REVIEW','REUSED_PREVIEW','ALREADY_IMPORTED','STALE']),previewId:z.string().max(100).nullable()}).strict();
export type Transfer=z.infer<typeof transferSchema>;
export type Receipt=z.infer<typeof receiptSchema>;
export function digest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export class AgentError extends Error{constructor(public code:string,public status=400){super(code);}}
export function productionOrigin(value:string){
 try{const url=new URL(value);if(url.protocol!=='https:'||!['mrcocotte.com','www.mrcocotte.com'].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error();return url.origin;}catch{throw new AgentError('INVALID_PRODUCTION_ORIGIN',503);}
}
