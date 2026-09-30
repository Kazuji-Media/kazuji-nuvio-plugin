'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sources,createPlan}=require('../src/sources');
const {normalizeConfig}=require('../src/aggregator');
test('catalog contains HTTP and automatic TorBox addons, excludes raw torrent and manual-login sources',()=>{
  assert.equal(sources.length,19);assert.equal(new Set(sources.map(s=>s.id)).size,19);
  for(const source of sources){
    assert.match(source.url,/^https:\/\//);
    assert.ok(['http','torbox'].includes(source.kind));
    if(source.kind==='torbox')assert.equal(typeof(source.configure||source.setup),'function');
  }
  for(const id of ['betor','piratebay','nyaa','pengu','orion','brasilrd'])assert.equal(sources.some(s=>s.id===id),false);
  assert.ok(createPlan({}).manifests.includes('https://398fe185fed6-zeus.baby-beamup.club/v1-p1kv-q27/manifest.json'));
});
test('a single key activates automatic addon configurations, empty or malformed keys keep public HTTP',()=>{
  assert.equal(createPlan({}).manifests.length,8);
  assert.equal(createPlan({torboxApiKey:' TEST_KEY '}).manifests.length,19);
  for(const key of ['', ' ', 'bad key', 'bad\nkey', 'a'.repeat(513)])assert.deepEqual(createPlan({torboxApiKey:key}).manifests,createPlan({}).manifests);
  assert.equal(createPlan({torboxApiKey:'TEST_KEY'}).manifests.some(url=>url.includes('/configure')),false);
});
test('saved manual manifest settings and source switches no longer alter the automatic catalog',()=>{
  const stale={useBuiltInSources:false,manifests:'not even a valid URL',sourceManifest_frost:'https://custom.example/manifest.json',sourceManifest_mediafusion:'https://custom.example/manifest.json',sourceEnabled_kingvod:false};
  assert.deepEqual(createPlan(stale).manifests,createPlan({}).manifests);
});
test('expanded source budget accommodates the full catalog plus extras and remains bounded',()=>{
  const manifests=Array.from({length:64},(_,i)=>'https://source'+i+'.example/manifest.json');
  assert.equal(normalizeConfig({manifests}).manifests.length,64);
  assert.throws(()=>normalizeConfig({manifests:manifests.concat('https://extra.example/manifest.json')}),/64 manifestos/);
});

test('addon configuration paths round-trip one key and explicitly request HTTP/cached results',()=>{
  const key='TEST_é_🔑_+=&|';
  const plan=createPlan({torboxApiKey:key});
  const unpack=id=>JSON.parse(Buffer.from(decodeURIComponent(plan.manifests.find(url=>url.startsWith(sources.find(s=>s.id===id).url+'/')).split('/').at(-2)),'base64url').toString());
  const comet=unpack('comet');assert.equal(comet.debridServices[0].apiKey,key);assert.equal(comet.enableTorrent,false);assert.equal(comet.cachedOnly,true);
  const meteor=unpack('meteor');assert.equal(meteor.services[0].apiKey,key);assert.equal(meteor.allowP2P,false);assert.equal(meteor.cachedOnly,true);
  const db=unpack('torrentsdb');assert.equal(db.torbox,key);assert.ok(db.debridoptions.includes('nodownloadlinks'));
  const jackettio=unpack('jackettio');assert.equal(jackettio.debridApiKey,key);assert.equal(jackettio.debridId,'torbox');assert.equal(jackettio.hideUncached,true);assert.ok(jackettio.qualities.includes(2160));
  assert.deepEqual(unpack('pipe'),{tb:key,st:'http'});
  const corsaro=unpack('corsaro');assert.equal(corsaro.torbox_key,key);assert.equal(corsaro.only_debrid_cache,true);
  for(const id of ['torrentio','brazuca']){
    const url=plan.manifests.find(url=>url.startsWith(sources.find(s=>s.id===id).url+'/'));
    assert.ok(url.includes('torbox='+encodeURIComponent(key)));assert.ok(url.includes('debridoptions=nodownloadlinks,nocatalog'));
    assert.equal(url.includes(key),false);
  }
});

test('opaque addon setup stays on its origin, caches successful references, and separates keys',async()=>{
  for(const [id,reply] of [['indexabr',{id:'indexa_123'}],['prowjack',{ok:true,userConfig:'cfg_123'}],['mediafusion',{status:'success',encrypted_str:'token_123=='}]]){
    const source=sources.find(s=>s.id===id),url=source.url+'/manifest.json',calls=[];
    const request=async(target,options)=>{calls.push({target,options});return{status:200,text:JSON.stringify(reply)};};
    const plan=createPlan({torboxApiKey:'CACHE_TEST_1'}),resolved=await plan.prepareManifest(url,request);
    assert.ok(resolved.startsWith(source.url+'/'));assert.ok(resolved.endsWith('/manifest.json'));
    assert.equal(calls.length,1);assert.equal(calls[0].options.method,'POST');assert.ok(calls[0].options.body.includes('CACHE_TEST_1'));
    assert.equal(await createPlan({torboxApiKey:'CACHE_TEST_1'}).prepareManifest(url,request),resolved);assert.equal(calls.length,1);
    await createPlan({torboxApiKey:'CACHE_TEST_2'}).prepareManifest(url,request);assert.equal(calls.length,2);
    assert.equal(await plan.prepareManifest('https://public.example/manifest.json',request),'https://public.example/manifest.json');assert.equal(calls.length,2);
  }
});

test('failed or malformed setup cannot fall back to a raw manifest, redirect, or poll',async()=>{
  const url='https://indexabr.vercel.app/manifest.json';
  for(const [i,response] of [
    {status:401,text:'{}'}, {status:429,text:'{}'}, {status:200,truncated:true,text:'{}'},
    {status:200,text:'not JSON'}, {status:200,text:'{}'}, {status:200,text:'{"id":"about:error"}'},
    {status:200,text:'{"id":"https://evil.example"}'}, {status:200,text:'{"id":"../elsewhere"}'},
  ].entries()){
    let calls=0;
    await assert.rejects(createPlan({torboxApiKey:'FAILURE_TEST_'+i}).prepareManifest(url,async()=>{calls++;return response;}));
    assert.equal(calls,1);
  }
});
