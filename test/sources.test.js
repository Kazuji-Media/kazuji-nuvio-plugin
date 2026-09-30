'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sources,applySources}=require('../src/sources');
const {normalizeConfig}=require('../src/aggregator');
test('all 30 supplied addons are embedded, configured sources never use a guessed public endpoint',()=>{
  assert.equal(sources.length,30);assert.equal(new Set(sources.map(s=>s.id)).size,30);
  for(const source of sources){
    assert.match(source.url,/^https:\/\//);
    if(source.kind==='configured')assert.equal(source.manifest,null);
    if(source.manifest){assert.match(source.manifest,/\/manifest\.json$/);assert.equal(source.manifest.includes('/configure/'),false);}
  }
  assert.equal(sources.find(s=>s.id==='zeus').manifest,'https://398fe185fed6-zeus.baby-beamup.club/v1-p1kv-q27/manifest.json');
  assert.ok(sources.find(s=>s.id==='torrentio').manifest.includes('providers=comando,bludv,micoleaodublado%7Clanguage=portuguese'));
});
test('builtins work without user input and TorBox key activates the public torrent indexers',()=>{
  const plain=applySources({},normalizeConfig),torbox=applySources({torboxApiKey:'TEST_KEY'},normalizeConfig);
  assert.equal(plain.manifests.length,sources.filter(s=>s.enabled).length);
  for(const source of sources.filter(s=>s.kind==='torrent'))assert.equal(torbox.manifests.includes(source.manifest),true);
  assert.equal(torbox.manifests.some(url=>url.includes('/app/configure')),false);
});
test('configured overrides replace each public endpoint, deduplicate and honor switches',()=>{
  const custom='https://source.example/config/manifest.json';
  const config=applySources({manifests:custom,sourceManifest_frost:custom,sourceManifest_mediafusion:custom,sourceEnabled_kingvod:false},normalizeConfig);
  assert.equal(config.manifests.filter(url=>url===custom).length,1);
  assert.equal(config.manifests.includes(sources.find(s=>s.id==='frost').manifest),false);
  assert.equal(config.manifests.includes(sources.find(s=>s.id==='kingvod').manifest),false);
  assert.deepEqual(applySources({useBuiltInSources:false,manifests:custom},normalizeConfig).manifests,[custom]);
  assert.equal(applySources({sourceEnabled_torrentio:true},normalizeConfig).manifests.includes(sources.find(s=>s.id==='torrentio').manifest),false);
});
test('expanded source budget accommodates the full catalog plus extras and remains bounded',()=>{
  const manifests=Array.from({length:64},(_,i)=>'https://source'+i+'.example/manifest.json');
  assert.equal(normalizeConfig({manifests}).manifests.length,64);
  assert.throws(()=>normalizeConfig({manifests:manifests.concat('https://extra.example/manifest.json')}),/64 manifestos/);
});
