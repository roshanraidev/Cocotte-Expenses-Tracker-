import {createHash,timingSafeEqual} from 'node:crypto';
import {AgentError,AGENT_PATH} from './protocol';
import type {ReceiverConfig} from './config';
export function authenticateAgent(request:Request,config:ReceiverConfig){
 const url=new URL(request.url);
 const expectedHost=new URL(config.origin).host,host=request.headers.get('host');
 // Proxy trust is explicit and endpoint-local. Only a private Node listener behind a
 // proxy that OVERWRITES these headers may enable it. Never trust X-Forwarded-Host.
 const proxied=config.trustProxy&&host===expectedHost&&request.headers.get('x-forwarded-proto')==='https';
 // Machine credentials only: never authorize this endpoint with staff cookies.
 if(request.method!=='POST'||!(url.origin===config.origin||proxied)||host!==null&&host!==expectedHost||url.pathname!==AGENT_PATH||url.search||request.headers.has('origin'))throw new AgentError('FORBIDDEN_REQUEST',403);
 const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization')??'');
 if(!match)throw new AgentError('UNAUTHORIZED',401);
 const actual=createHash('sha256').update(match[1]).digest();
 if(!timingSafeEqual(actual,Buffer.from(config.tokenHash,'hex')))throw new AgentError('UNAUTHORIZED',401);
}
// Single configured identity: bounded memory, no attacker-controlled map keys.
let windowAt=0,requests=0;
export function limitAgentRequests(now=Date.now()){
 if(now-windowAt>=60000){windowAt=now;requests=0;}
 if(++requests>120)throw new AgentError('RATE_LIMITED',429);
}
