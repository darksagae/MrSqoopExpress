import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Load the actual business functions with external I/O replaced. This avoids
// importing Next aliases or connecting to production services in plain Node.
const source=fs.readFileSync(new URL('../lib/checkout.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replaceAll('export async function','async function');
function checkout({error, dbError}={}) {
  const calls={provider:0,failed:0,attached:[]};
  const deps={
    resolveProvider:()=>({ready:true,label:'Airtel Money',missing:[],provider:{requestToPay:async()=>{
      calls.provider++;if(error)throw error;return{transactionId:'MSE-TEST'};
    }}}), NETWORKS:['mtn','airtel'],
    createOrder:async()=>{if(dbError)throw dbError;},newOrderId:async()=> 'MSE-TEST',
    attachPaymentRef:async(id,ref)=>{calls.attached.push({id,ref});},failUnsentOrder:async()=>{calls.failed++;},
    isTestCheckout:()=>false,detectNetwork:()=> 'airtel',
    confirmCartTotal:async()=>({lines:[],total:500}),
    console:{error(){},log(){}},
  };
  const fn=new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;\n${source}\nreturn startMobileMoneyOrder;`)(deps);
  const run=()=>fn({account:{id:'offline-account'},customer:{name:'Offline Test',phone:'0750000000'},network:'airtel',items:[{id:'offline'}],total:500});
  return {calls,run};
}
test('uncertain acceptance is reconciled under its existing reference, not failed or retried',async()=>{
  const {calls,run}=checkout({error:Object.assign(new Error('response lost'),{paymentUncertain:true,referenceId:'MSE-TEST'})});
  const result=await run();assert.equal(result.status,202);assert.equal(result.body.status,'pending');
  assert.equal(result.body.reference,'MSE-TEST');assert.equal(result.body.requestUncertain,true);
  assert.deepEqual(calls,{provider:1,failed:0,attached:[{id:'MSE-TEST',ref:'MSE-TEST'}]});
});
test('explicit gateway rejection closes an unsent order',async()=>{
  const {calls,run}=checkout({error:Object.assign(new Error('gateway rejected'),{code:'LIPAPAY_REQUEST_FAILED'})});
  const result=await run();assert.equal(result.status,502);assert.equal(calls.failed,1);assert.equal(calls.provider,1);assert.equal(calls.attached.length,0);
});
test('a database failure cannot leave an unrecorded payment request',async()=>{
  const {calls,run}=checkout({dbError:new Error('offline database fault')});
  assert.equal((await run()).status,500);assert.equal(calls.provider,0);
});
test('verified acceptance keeps the normal pending checkout contract',async()=>{
  const {calls,run}=checkout();const result=await run();assert.equal(result.status,200);
  assert.equal(result.body.status,'pending');assert.equal(result.body.requestUncertain,false);assert.equal(calls.provider,1);
});
