import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdsService, validateAdsQuery } from '../ads.js';

const inventory = { connections: [
  { id: 'ca_expired', toolkitSlug: 'metaads', status: 'EXPIRED', secret: 'never-return' },
  { id: 'ca_active', toolkitSlug: 'metaads', status: 'ACTIVE', secret: 'never-return' },
] };
const snapshot = { ok: true, updated_at: '2026-10-08T00:00:00Z', account: { id: 'act_123', name: 'Corgi Ads', currency: 'USD' }, accounts: [{ id: 'act_123' }], ads: [], period: 'today' };
const response = (body, status = 200) => Response.json(body, { status });

test('Ads inputs reject shell fragments, arbitrary connection IDs, and unsupported periods', () => {
  for (const query of [{account:'act_1; echo secret'},{account:['act_1']},{period:'maximum'},{connection:'../private'},{refresh:'yes'}]) {
    assert.throws(() => validateAdsQuery(query), { code: 'invalid_request', status: 400 });
  }
  assert.equal(validateAdsQuery({account:'act_123',period:'last_7d',refresh:'1'}).refresh, true);
});

test('Ads uses only the active owner connection, uploads fixed code, caches and coalesces reads', async () => {
  const calls = [];
  const read = createAdsService({apiKey:'test-server-key',apiBase:'https://api.agent37.com',appDomain:'agent37.app',fetchImpl:async(url,init)=>{
    calls.push({url,init});
    if (url.endsWith('/integrations/connections')) return response(inventory);
    if (url.includes('/v1/files/content?')) return response({});
    assert.equal(url, 'https://api.agent37.com/v1/instances/abcdefghij/exec');
    const command=JSON.parse(init.body).command;
    assert.match(command, /^python3 ~\/muse\/\.setup\/ads-reader-[a-f0-9]+\.py '[A-Za-z0-9+/=]+'$/);
    assert.ok(!command.includes('test-server-key'));
    const args=JSON.parse(Buffer.from(command.split("'")[1],'base64').toString());
    assert.deepEqual(args,{connection:'ca_active',account:'',period:'today'});
    return response({exit_code:0,stdout:JSON.stringify(snapshot)});
  }});
  const [first,second]=await Promise.all([read('abcdefghij',{}),read('abcdefghij',{})]);
  assert.deepEqual(first,second);
  assert.ok(!JSON.stringify(first).includes('never-return'));
  assert.deepEqual(first.connections,[{id:'ca_active',name:'Meta Ads'}]);
  await read('abcdefghij',{account:'act_123'});
  assert.equal(calls.filter(c=>c.url.endsWith('/exec')).length,1);
  await read('abcdefghij',{refresh:'1'});
  assert.equal(calls.filter(c=>c.url.endsWith('/exec')).length,2);
  await assert.rejects(read('abcdefghij',{connection:'ca_expired'}),{code:'reconnect_required'});
});

test('Ads handles disconnected accounts and failed remote readers without leaking output', async () => {
  const disconnected = createAdsService({fetchImpl:async()=>response({connections:[]})});
  assert.equal((await disconnected('abcdefghij',{})).connection_required,true);
  for (const result of [{exit_code:1,stderr:'secret-details'},{exit_code:0,stdout:'secret-invalid-json'},{exit_code:0,stdout:JSON.stringify({ok:false,code:'reconnect_required'})}]) {
    const read=createAdsService({fetchImpl:async(url)=>response(url.endsWith('/integrations/connections')?inventory:url.includes('/files/content?')?{}:result)});
    await assert.rejects(read('abcdefghij',{}),(error)=>!error.message.includes('secret') && ['meta_unavailable','reconnect_required'].includes(error.code));
  }
});
