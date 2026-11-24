import 'server-only';
import {Client} from 'pg';
// One dedicated LISTEN connection per web process, never a transaction-pool connection.
const listeners=new Map<symbol,{restaurant:string;notify:()=>void}>();
let client:Client|null=null,connecting=false,retry:ReturnType<typeof setTimeout>|undefined;
async function connect(){
 if(client||connecting||!listeners.size)return;connecting=true;
 const next=new Client({connectionString:process.env.KITCHEN_EVENTS_DATABASE_URL||process.env.DATABASE_URL,application_name:'cocotte-kitchen-events',connectionTimeoutMillis:5000});
 let ended=false;
 const lost=()=>{if(ended)return;ended=true;if(client===next)client=null;void next.end().catch(()=>{});if(listeners.size&&!retry)retry=setTimeout(()=>{retry=undefined;void connect();},3000);};
 next.on('error',lost);next.on('end',lost);
 next.on('notification',message=>{try{const data=JSON.parse(message.payload??'{}');for(const l of listeners.values())if(l.restaurant===data.restaurantId)l.notify();}catch{/* Invalid payload carries no content. */}});
 try{await next.connect();await next.query('LISTEN cocotte_kitchen');if(!listeners.size){ended=true;await next.end();return;}client=next;for(const l of listeners.values())l.notify();}catch{lost();}finally{connecting=false;}
}
export function subscribeKitchen(restaurant:string,notify:()=>void){const key=Symbol();listeners.set(key,{restaurant,notify});void connect();return()=>{listeners.delete(key);if(!listeners.size){clearTimeout(retry);retry=undefined;const old=client;client=null;void old?.end().catch(()=>{});}};}
