'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function sandbox(settings,fetch){
  const context=vm.createContext({module:{exports:{}},console:{info(){},warn(){}},setTimeout,clearTimeout,AbortController,Uint8Array,TextEncoder,TMDB_API_KEY:'key',SCRAPER_SETTINGS:settings,fetch});
  vm.runInContext(fs.readFileSync(require.resolve('../providers/kazuji.js'),'utf8'),context);
  return context.module.exports;
}
test('generated plugin exports the current Nuvio contract and settings schema',()=>{
  const plugin=sandbox({},()=>{});assert.equal(typeof plugin.getStreams,'function');
  const fields=plugin.onSettings();assert.ok(fields.some(x=>x.key==='manifests'));assert.ok(fields.some(x=>x.key==='allowedRatings'));
  for(const field of fields)assert.ok(['header','info','text','select','toggle'].includes(field.type));
  const manifest=require('../manifest.json');assert.equal(manifest.scrapers[0].hasSettings,true);assert.equal(manifest.scrapers[0].filename,'providers/kazuji.js');
});
test('runs generated bundle without Node imports using the native fetch response shape',async()=>{
  const calls=[];
  const fetch=async(url,options)=>{
    calls.push({url,options});let data,bytes=new Uint8Array(0);
    if(url.includes('themoviedb'))data={imdb_id:'tt123'};
    else if(url.endsWith('manifest.json'))data={name:'Native source',id:'source',types:['movie'],resources:['stream'],idPrefixes:['tt']};
    else if(url.includes('/stream/'))data={streams:[{title:'Film 1080p Dublado',url:'https://media.example/film.mp4'}]};
    else {bytes=new Uint8Array(262144);await new Promise(r=>setTimeout(r,3));}
    const text=data?JSON.stringify(data):'';
    return{status:200,url,headers:{get:key=>key==='content-type'?'video/mp4':null},arrayBuffer:async()=>bytes.buffer,text:async()=>text};
  };
  const plugin=sandbox({manifests:'https://source.example/manifest.json',qualities:'1080',settleMs:'0'},fetch);
  const streams=await plugin.getStreams('123','movie');assert.equal(streams.length,1);assert.equal(streams[0].quality,'1080p');
  assert.ok(calls.some(x=>x.options.headers.Range==='bytes=0-262143'));
});

function qualityPlugin(settings){
  const fetch=async url=>{
    const data=url.includes('themoviedb')?{imdb_id:'tt123'}:url.endsWith('manifest.json')?
      {name:'Source',id:'source',types:['movie'],resources:['stream'],idPrefixes:['tt']}:
      {streams:[2160,1080,720,480,0].map(q=>({quality:q,title:'PT-BR',url:'https://media.example/'+q+'.mp4'}))};
    return{status:200,url,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array(0).buffer,text:async()=>JSON.stringify(data)};
  };
  return sandbox({manifests:'https://source.example/manifest.json',probeMode:'off',allowUnverified:true,...settings},fetch);
}
test('quality switches preserve multiple selections, unknown quality and legacy partial settings',async()=>{
  for(const [settings,expected] of [
    [{quality2160:true,quality1080:true,quality720:false,quality480:false,quality0:false},['4K','1080p']],
    [{qualities:'720'},['720p']],
    [{qualities:'720',quality1080:true},['1080p','720p']],
    [{quality2160:false,quality1080:false,quality720:false,quality480:false,quality0:true},['Qualidade desconhecida']],
    [{quality2160:false,quality1080:false,quality720:'true',quality480:false},['720p']],
  ]){
    const rows=await qualityPlugin(settings).getStreams('123','movie');
    assert.deepEqual(Array.from(rows,row=>row.quality),expected);
  }
});
test('rejects an empty quality selection and lets explicit advanced qualities override switches',async()=>{
  const disabled={quality2160:false,quality1080:false,quality720:false,quality480:false,quality0:false};
  await assert.rejects(qualityPlugin(disabled).getStreams('123','movie'),/Selecione ao menos uma qualidade/);
  const rows=await qualityPlugin({...disabled,advancedJson:'{"qualities":[480]}'}).getStreams('123','movie');
  assert.deepEqual(Array.from(rows,row=>row.quality),['480p']);
});
test('native quality defaults reflect existing text selections when migrating',()=>{
  const fields=qualityPlugin({qualities:'1080,720'}).onSettings();
  assert.equal(fields.some(x=>x.key==='qualities'),false);
  const toggles=fields.filter(x=>/^quality\d+$/.test(x.key||''));
  assert.equal(toggles.length,5);
  assert.deepEqual(Array.from(toggles.filter(x=>x.defaultValue),x=>x.key),['quality1080','quality720']);
});
