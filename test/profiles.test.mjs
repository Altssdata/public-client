import test from 'node:test';
import assert from 'node:assert/strict';
import { AltssPublicClient } from '../src/index.mjs';
import { runCli } from '../src/cli.mjs';
const response=()=>new Response('{"results":[]}',{headers:{'Content-Type':'application/json','Altss-Environment':'sandbox','RateLimit-Limit':'120','RateLimit-Remaining':'119','RateLimit-Reset':'60'}});
test('public search encodes the name and keeps the fixed origin, GET and omitted credentials',async()=>{
 let captured;
 const client=new AltssPublicClient({fetch:async(url,options)=>{captured={url,options};return response();}});
 const result=await client.searchProfiles('Daimler & Truck',{limit:2,cursor:'abc_123'});
 const url=new URL(captured.url);assert.equal(url.origin,'https://altss.com');assert.equal(url.pathname,'/api/v1/public/profiles');assert.equal(url.searchParams.get('query'),'Daimler & Truck');assert.equal(url.searchParams.get('cursor'),'abc_123');
 assert.equal(captured.options.method,'GET');assert.equal(captured.options.credentials,'omit');assert.equal(captured.options.redirect,'error');assert.equal(captured.options.headers.Authorization,undefined);assert.equal(result.rateLimit.limit,'120');
});
test('sandbox affects only profile reads, preserving the named public catalog contract',async()=>{
 const paths=[];const client=new AltssPublicClient({sandbox:true,fetch:async url=>{paths.push(new URL(url).pathname);return response();}});
 await client.searchProfiles('Example');await client.getProfile('example-capital-01');await client.getCatalog('data');
 assert.deepEqual(paths,['/api/v1/sandbox/public/profiles','/api/v1/sandbox/public/profiles/example-capital-01','/api/v1/data-catalog.json']);
});
for(const slug of ['../account','https://app.altss.com','x?token=secret','UPPER','',null])test('rejects invalid profile slug '+JSON.stringify(slug),()=>{assert.throws(()=>new AltssPublicClient({fetch:()=>{throw Error('Must not request');}}).getProfile(slug));});
for(const [query,options]of [['x',{}],['__',{}],['Company',{limit:6}],['Company',{limit:1.5}],['Company',{cursor:'../secret'}],['Company',{cursor:''}]])test('rejects invalid bounded search '+JSON.stringify([query,options]),()=>{assert.throws(()=>new AltssPublicClient({fetch:()=>{throw Error('Must not request');}}).searchProfiles(query,options));});
test('CLI public search uses the typed helper and sandbox without echoing input on failure',async()=>{
 let output='',seen;const status=await runCli(['search','Example','--limit','2','--sandbox'],{stdout:t=>{output+=t;},createClient:options=>({searchProfiles:async(query,request)=>{seen={options,query,request};return {status:200,data:{results:[]}};}})});
 assert.equal(status,0);assert.deepEqual(seen,{options:{sandbox:true},query:'Example',request:{limit:2}});assert.equal(JSON.parse(output).status,200);
 let error='';assert.equal(await runCli(['profile','../../PRIVATE'],{stderr:t=>{error+=t;},createClient:()=>new AltssPublicClient({fetch:()=>{throw Error('No request');}})}),1);assert.ok(!error.includes('PRIVATE'));
});
