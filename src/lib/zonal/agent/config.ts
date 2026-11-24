import {AgentError,AGENT_PATH,agentIdSchema,productionOrigin} from './protocol';
export function localDatabaseOnly(value:string|undefined){
 try{const url=new URL(value??'');if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error();}catch{throw new AgentError('LOCAL_DATABASE_REQUIRED',503);}
}
export function localAgentConfig(env:Record<string,string|undefined>=process.env,platform:NodeJS.Platform=process.platform){
 if(env.ZONAL_AGENT_UPLOAD_ENABLED!=='true')return null;
 if(platform!=='darwin')throw new AgentError('MAC_AGENT_REQUIRED',503);
 localDatabaseOnly(env.DATABASE_URL);
 if(!agentIdSchema.safeParse(env.ZONAL_AGENT_ID).success||!env.ZONAL_AGENT_LOCAL_RESTAURANT_ID||!/^[A-Za-z0-9._-]{3,100}$/.test(env.ZONAL_AGENT_KEYCHAIN_ACCOUNT??'')||env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new AgentError('LOCAL_AGENT_NOT_CONFIGURED',503);
 const raw=env.ZONAL_AGENT_UPLOAD_URL??'';let origin:string;
 try{const url=new URL(raw);if(url.pathname!==AGENT_PATH||url.search||url.hash||url.username||url.password||url.port)throw new Error();origin=productionOrigin(url.origin);}catch{throw new AgentError('INVALID_UPLOAD_URL',503);}
 return {agentId:env.ZONAL_AGENT_ID!,restaurantId:env.ZONAL_AGENT_LOCAL_RESTAURANT_ID,account:env.ZONAL_AGENT_KEYCHAIN_ACCOUNT!,url:origin+AGENT_PATH};
}
export function receiverConfig(env:Record<string,string|undefined>=process.env){
 if(!agentIdSchema.safeParse(env.ZONAL_AGENT_ID).success||! /^[a-f0-9]{64}$/.test(env.ZONAL_AGENT_TOKEN_SHA256??'')||!env.ZONAL_AGENT_RESTAURANT_ID||!env.ZONAL_AGENT_ACTOR_ID)throw new AgentError('RECEIVER_DISABLED',503);
 return {agentId:env.ZONAL_AGENT_ID!,tokenHash:env.ZONAL_AGENT_TOKEN_SHA256!,restaurantId:env.ZONAL_AGENT_RESTAURANT_ID,actorId:env.ZONAL_AGENT_ACTOR_ID,origin:productionOrigin(env.ZONAL_AGENT_RECEIVER_ORIGIN??''),trustProxy:env.ZONAL_AGENT_TRUST_PROXY==='true'};
}
export type ReceiverConfig=ReturnType<typeof receiverConfig>;
