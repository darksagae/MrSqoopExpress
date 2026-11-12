import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../lib/payments/airtel-merchant.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export const','const').replaceAll('export async function','async function').replaceAll('export function','function');
test('customer payment claim is ownership-scoped and cannot mark payment successful',async()=>{
  let query,values;
  const getSql=()=>async(parts,...args)=>{query=parts.join('?');values=args;return[{id:'MSE-1'}];};
  const fn=new Function('getSql','ensureAccountColumns',source+'\nreturn markAirtelMerchantClaimed;')(getSql,async()=>true);
  assert.equal(await fn('MSE-1','customer-1'),true);
  assert.match(query,/user_id =/);assert.match(query,/network = 'airtel'/);assert.match(query,/payment_status = 'PENDING'/);
  assert.match(query,/payment_ref LIKE/);assert.doesNotMatch(query,/SET payment_status|SUCCESSFUL|paid_at/);
  assert.deepEqual(values,['MSE-1','customer-1','AIRTELMERCHANT-%']);
});
