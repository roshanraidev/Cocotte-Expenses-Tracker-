import {beforeEach,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
const hooks=vi.hoisted(()=>({states:[] as unknown[]}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useActionState:()=>hooks.states.shift()}));
vi.mock('@/app/(protected)/orders/zonal-delivery-actions',()=>({checkZonalDeliveries:()=>{},approveZonalDeliveries:()=>{}}));
import Panel from '@/app/(protected)/orders/zonal-delivery-panel';
function render(eligible:boolean){hooks.states=[[{error:'',message:'Synthetic preview',previewId:'test-preview',range:{from:'2026-11-01',to:'2026-11-11'},rows:[{id:'fixture',date:'2026-11-11',supplier:'TEST FOOD',document:'FIXTURE',invoice:'10000',items:'10000',unknown:'0',credit:'0',total:'10000',period:'fixture',eligible,verifiedNet:'10000',status:eligible?'Ready to Import':'Needs Review',match:'MATCHED',supplierId:'test',reason:eligible?'':'Unconfirmed',reviewReasons:eligible?[]:['Unconfirmed']} ]},()=>{},false],[{error:'',message:''},()=>{},false]];return renderToStaticMarkup(createElement(Panel,{from:'2026-11-01',to:'2026-11-11'}));}
beforeEach(()=>{hooks.states=[];});
it('enables the existing import button only for eligible server-preview rows',()=>{const html=render(true);const button=html.match(/<button[^>]*>Import Matched Deliveries<\/button>/)?.[0];expect(button).toBeTruthy();expect(button).not.toContain('disabled');expect(html).toContain('name="previewId"');});
it('keeps import disabled for uncertain records',()=>{const html=render(false);const button=html.match(/<button[^>]*>Import Matched Deliveries<\/button>/)?.[0];expect(button).toContain('disabled');expect(html).toContain('Unconfirmed');});
