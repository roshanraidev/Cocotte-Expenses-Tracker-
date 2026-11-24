import 'server-only';
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
export function encryptionKey(){const value=process.env.NOTIFICATIONS_ENCRYPTION_KEY??'';if(!/^[a-f\d]{64}$/i.test(value))throw new Error('Notifications encryption key is not configured.');return Buffer.from(value,'hex');}
export function seal(value:unknown){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64');}
export function unseal(value:string){const bytes=Buffer.from(value,'base64');const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(-16));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString());}
export const endpointHash=(endpoint:string)=>createHash('sha256').update(endpoint).digest('hex');
export function safeSubscription(value:unknown):{endpoint:string;keys:{p256dh:string;auth:string}}{
 const data=value as {endpoint?:string;keys?:{p256dh?:string;auth?:string}};const url=new URL(data?.endpoint??'');
 const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com','notify.windows.com'];
 if(url.protocol!=='https:'||url.port||url.username||url.password||!allowed.some(host=>url.hostname===host||url.hostname.endsWith('.'+host))||url.href.length>2048)throw new Error('Unsupported push service.');
 const {p256dh,auth}=data.keys??{};if(!p256dh||!auth||!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh)||!/^[A-Za-z0-9_-]{20,30}$/.test(auth))throw new Error('Invalid push subscription.');
 return {endpoint:url.href,keys:{p256dh,auth}};
}
export function sameOrigin(request:Request){return request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('sec-fetch-site')!=='cross-site';}
