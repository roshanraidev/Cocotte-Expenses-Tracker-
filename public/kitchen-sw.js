/* No fetch handler: authenticated content is never cached by this worker. */
self.addEventListener('push',event=>{
 let data;try{data=event.data.json();}catch{return;}
 if(typeof data.id!=='string')return;
 event.waitUntil(self.registration.showNotification('Cocotte Kitchen Intelligence',{body:'A kitchen update is available. Sign in to view.',tag:'cocotte:'+data.id,renotify:false,data:{url:'/notifications/open/'+encodeURIComponent(data.id)}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url=new URL(event.notification.data.url,self.location.origin);
 if(url.origin!==self.location.origin||!url.pathname.startsWith('/notifications/open/'))return;
 event.waitUntil(clients.openWindow(url.href));
});
self.addEventListener('pushsubscriptionchange',event=>{
 event.waitUntil((async()=>{
  if(!event.oldSubscription)return;
  const subscription=event.newSubscription||await self.registration.pushManager.subscribe(event.oldSubscription.options);
  await fetch('/api/kitchen/push',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'renew',subscription:subscription.toJSON()})});
 })().catch(()=>{}));
});
