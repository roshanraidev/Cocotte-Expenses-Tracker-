import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({db:{$transaction:vi.fn(),$queryRaw:vi.fn(),kitchenPushSubscription:{findUnique:vi.fn(),deleteMany:vi.fn()},user:{findUnique:vi.fn()},kitchenPreference:{findUnique:vi.fn()},kitchenPushDelivery:{updateMany:vi.fn()}},access:vi.fn(),notices:vi.fn()}));
vi.mock('@/lib/db',()=>({db:()=>mocks.db}));
vi.mock('@/lib/access',()=>({resolveAccess:mocks.access}));
vi.mock('@/lib/kitchen/service',()=>({notices:mocks.notices}));
import {notificationTick} from '../src/lib/kitchen/worker';
import {seal} from '../src/lib/kitchen/security';
beforeEach(()=>{
 vi.clearAllMocks();process.env.NOTIFICATIONS_ENCRYPTION_KEY='ab'.repeat(32);
 mocks.db.$transaction.mockImplementation(async action=>action({$queryRaw:vi.fn().mockResolvedValue([])}));
 mocks.db.$queryRaw.mockResolvedValue([{eventId:'event',subscriptionId:'subscription',attempts:1}]);
 mocks.db.kitchenPushSubscription.findUnique.mockResolvedValue({id:'subscription',userId:'user',ciphertext:seal({endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:'fake',auth:'fake'}})});
 mocks.db.user.findUnique.mockResolvedValue({id:'user',active:true,restaurantId:'restaurant'});mocks.access.mockResolvedValue({id:'user'});
 mocks.db.kitchenPreference.findUnique.mockResolvedValue({pushEnabled:true,push:{}});mocks.notices.mockResolvedValue([{id:'event',category:'specials',name:'Private recipe name'}]);
});
it('sends only generic authenticated-link payloads and acknowledges the leased job',async()=>{
 const send=vi.fn().mockResolvedValue({statusCode:201});await notificationTick(send);
 expect(send).toHaveBeenCalledOnce();const payload=JSON.parse(send.mock.calls[0][1]);expect(payload.body).not.toContain('Private');expect(payload.url).toBe('/notifications/open/event');expect(mocks.db.kitchenPushDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({leaseToken:expect.any(String)}),data:expect.objectContaining({sentAt:expect.any(Date)})}));
 // No pending claim => repeat worker tick cannot resend an acknowledged event.
 mocks.db.$queryRaw.mockResolvedValue([]);await notificationTick(send);expect(send).toHaveBeenCalledOnce();
});
it.each(['revoked access','disabled preference','unsubscribed category','inactive user'])('does not send after %s',async reason=>{
 if(reason==='revoked access')mocks.notices.mockResolvedValue([]);
 if(reason==='disabled preference')mocks.db.kitchenPreference.findUnique.mockResolvedValue({pushEnabled:false,push:{}});
 if(reason==='unsubscribed category')mocks.db.kitchenPreference.findUnique.mockResolvedValue({pushEnabled:true,push:{specials:false}});
 if(reason==='inactive user')mocks.db.user.findUnique.mockResolvedValue({id:'user',active:false});
 const send=vi.fn();await notificationTick(send);expect(send).not.toHaveBeenCalled();expect(mocks.db.kitchenPushDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{failed:true,leaseUntil:null}}));
});
it('removes expired browser subscriptions without logging provider details',async()=>{const send=vi.fn().mockRejectedValue({statusCode:410,body:'sensitive provider content'});await notificationTick(send);expect(mocks.db.kitchenPushSubscription.deleteMany).toHaveBeenCalledWith({where:{id:'subscription'}});});
it('retries transient failures with bounded attempts',async()=>{mocks.db.$queryRaw.mockResolvedValue([{eventId:'event',subscriptionId:'subscription',attempts:5}]);await notificationTick(vi.fn().mockRejectedValue(new Error('timeout')));expect(mocks.db.kitchenPushDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({failed:true,nextAttemptAt:expect.any(Date),leaseUntil:null})}));});
