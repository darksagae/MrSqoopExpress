import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Exercise the actual server handler without a database or external requests.
const text = await fs.readFile(new URL('../api/orders/track.ts', import.meta.url), 'utf8');
const source = text.replace(/^import.*\n/gm, '').replace('export default async function handler(req: VercelRequest, res: VercelResponse)', 'async function handler(req, res)').replace(/: string/g, '');
const makeHandler = new Function('findOrderByQuery', 'fetch', 'process', `${source}; return handler`);
const row = { id:'manual', trackingId:'MANUAL-1', createdAt:'2026-01-01', currentStageIndex:5 };
const candidate = { id:'shop', trackingId:'MSE-NEW', source:'shop', createdAt:'2026-11-01', currentStageIndex:0 };
async function run({q='MSE-NEW',find=async()=>null,upstream={status:200,ok:true,json:async()=>({order:candidate})},secret='shared'}={}) {
 let calls=0;
 const handler=makeHandler(find,async(url,options)=>{calls++;assert.equal(options.headers['x-ingest-secret'],'shared');assert.ok(url.startsWith('https://www.mrsqoopexpress.com/api/admin/tracking?q='));if(upstream instanceof Error)throw upstream;return upstream},{env:{ORDER_INGEST_SECRET:secret}});
 const res={code:200,setHeader(){},status(c){this.code=c;return this},json(data){this.data=data;return this}};
 await handler({method:'GET',query:{q}},res);return {...res,calls};
}
test('guest lookup bridges an unsynced shop order',async()=>{const r=await run();assert.equal(r.code,200);assert.equal(r.data.order.source,'shop')});
test('canonical shipment progress wins over shop fallback',async()=>{const r=await run({q:'MANUAL-1',find:async()=>row});assert.equal(r.calls,0);assert.equal(r.data.order.currentStageIndex,5)});
test('phone lookup returns newer shop order',async()=>{const r=await run({q:'0700000000',find:async(q)=>q==='MSE-NEW'?null:row});assert.equal(r.data.order.trackingId,'MSE-NEW')});
test('phone lookup preserves canonical stages for synced order',async()=>{const canonical={...candidate,currentStageIndex:6};const r=await run({q:'0700000000',find:async(q)=>q==='MSE-NEW'?canonical:row});assert.equal(r.data.order.currentStageIndex,6)});
test('shop outage does not hide existing manual order',async()=>{const r=await run({q:'0700000000',find:async()=>row,upstream:new Error('timeout')});assert.equal(r.code,200);assert.equal(r.data.order.id,'manual')});
test('missing order is 404, dependency failure is 502',async()=>{assert.equal((await run({upstream:{ok:false,status:404}})).code,404);assert.equal((await run({upstream:new Error('timeout')})).code,502)});
test('missing shared secret fails closed',async()=>{const r=await run({secret:''});assert.equal(r.code,503);assert.equal(r.calls,0)});
const bridgeText = await fs.readFile(new URL('../shop/app/api/admin/tracking/route.js', import.meta.url), 'utf8');
const bridgeSource=bridgeText.replace(/^import.*\n/gm,'').replace('export async function GET','async function GET');
const makeBridge=new Function('NextResponse','isSettingsAdmin','getSql',`${bridgeSource};return GET`);
const response={json:(data,options={})=>({data,status:options.status||200})};
test('shop bridge rejects unauthenticated callers before reading database',async()=>{const bridge=makeBridge(response,()=>false,()=>{throw Error('must not read')});assert.equal((await bridge(new Request('https://shop/api/admin/tracking?q=MSE-X'))).status,401)});
test('shop bridge returns only public fields and retains pending payment state',async()=>{const bridge=makeBridge(response,()=>true,()=>async()=>[{id:'MSE-X',customer_name:'Customer',customer_phone:'0700000000',amount_ugx:700,payment_status:'PENDING',created_at:'2026-11-01',payment_ref:'SECRET',items:['private'],customer_email:'private'}]);const r=await bridge(new Request('https://shop/api/admin/tracking?q=MSE-X'));assert.equal(r.data.order.paymentStatus,'PENDING');assert.equal(r.data.order.payment_ref,undefined);assert.equal(r.data.order.items,undefined);assert.equal(r.data.order.customer_email,undefined)});
test('partial phone query cannot match a phone in shop database',async()=>{let values;const bridge=makeBridge(response,()=>true,()=>async(_,...params)=>{values=params;return []});const r=await bridge(new Request('https://shop/api/admin/tracking?q=0000'));assert.equal(r.status,404);assert.deepEqual(values,['0000','',''])});
