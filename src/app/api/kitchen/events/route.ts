import {currentUser} from '@/lib/auth';
import {can} from '@/lib/permissions';
import {kitchenSnapshot} from '@/lib/kitchen/service';
import {subscribeKitchen} from '@/lib/kitchen/stream';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 const user=await currentUser();if(!user)return new Response(null,{status:401});if(!can(user,'recipes.view'))return new Response(null,{status:403});
 const encoder=new TextEncoder();let cleanup=()=>{};
 const stream=new ReadableStream({start(controller){
  let stopped=false,busy=false,dirty=false;
  const write=(data:string)=>{if(!stopped)try{controller.enqueue(encoder.encode(data));}catch{cleanup();}};
  async function refresh(){if(stopped)return;if(busy){dirty=true;return;}busy=true;
   try{const fresh=await currentUser();if(!fresh||fresh.id!==user!.id||fresh.restaurantId!==user!.restaurantId||!can(fresh,'recipes.view')){write('event: unavailable\ndata: {}\n\n');cleanup();return;}
    write(`data: ${JSON.stringify(await kitchenSnapshot(fresh))}\n\n`);
   }catch{write('event: unavailable\ndata: {}\n\n');}finally{busy=false;if(dirty){dirty=false;void refresh();}}
  }
  const unsubscribe=subscribeKitchen(user!.restaurantId,()=>void refresh());
  // Heartbeats also re-check session/permissions and time-based special expiry.
  const heartbeat=setInterval(()=>void refresh(),20000),expiry=setTimeout(()=>cleanup(),55000);
  cleanup=()=>{if(stopped)return;stopped=true;unsubscribe();clearInterval(heartbeat);clearTimeout(expiry);request.signal.removeEventListener('abort',cleanup);try{controller.close();}catch{/* The consumer may already have cancelled. */}};
  if(request.signal.aborted)cleanup();else request.signal.addEventListener('abort',cleanup,{once:true});void refresh();
 },cancel(){cleanup();}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'private, no-store','X-Accel-Buffering':'no','Vary':'Cookie'}});
}
