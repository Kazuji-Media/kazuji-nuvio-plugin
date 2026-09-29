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
