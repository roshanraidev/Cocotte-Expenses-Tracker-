import {AgentError,MAX_BODY} from './protocol';
/** Bound streamed input even when Content-Length is absent or dishonest. */
export async function boundedJson(message:Request|Response):Promise<unknown>{
 const length=message.headers.get('content-length');
 if(length&&(!/^\d+$/.test(length)||Number(length)>MAX_BODY))throw new AgentError('BODY_TOO_LARGE',413);
 if(!message.body)throw new AgentError('INVALID_JSON',422);
 const reader=message.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 const timer=setTimeout(()=>void reader.cancel().catch(()=>{}),10000);
 try{
  while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>MAX_BODY)throw new AgentError('BODY_TOO_LARGE',413);chunks.push(result.value);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AgentError('INVALID_JSON',422);}
 }finally{clearTimeout(timer);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
