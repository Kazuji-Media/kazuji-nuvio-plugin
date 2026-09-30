'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function sandbox(settings,fetch,defaults={},stats=[],filename='../providers/kazuji.js'){
  const context=vm.createContext({module:{exports:{}},console:{info(message){stats.push(JSON.parse(message.slice('[Kazuji] '.length)));},warn(){}},setTimeout,clearTimeout,AbortController,Uint8Array,TextEncoder,TMDB_API_KEY:'key',KAZUJI_DEFAULT_CONFIG:{useBuiltInSources:false,...defaults},SCRAPER_SETTINGS:settings,fetch});
  vm.runInContext(fs.readFileSync(require.resolve(filename),'utf8'),context);
  return context.module.exports;
}
test('generated plugin exports the current Nuvio contract and settings schema',()=>{
  const plugin=sandbox({},()=>{});assert.equal(typeof plugin.getStreams,'function');
  const fields=plugin.onSettings();assert.ok(fields.some(x=>x.key==='manifests'));assert.ok(fields.some(x=>x.key==='allowedRatings'));
  assert.equal(fields.some(x=>['probeMode','probeTimeoutMs','allowUnverified'].includes(x.key)),false);
  for(const field of fields)assert.ok(['header','info','text','select','toggle'].includes(field.type));
  const manifest=require('../manifest.json');assert.equal(manifest.scrapers[0].hasSettings,true);assert.equal(manifest.scrapers[0].filename,'qualities/4k/provider.js');
});
test('runs generated bundle without Node imports using the native fetch response shape',async()=>{
  const calls=[];
  const fetch=async(url,options)=>{
    calls.push({url,options});let data;const bytes=new Uint8Array(0);
    if(url.includes('themoviedb'))data={imdb_id:'tt123'};
    else if(url.endsWith('manifest.json'))data={name:'Native source',id:'source',types:['movie'],resources:['stream'],idPrefixes:['tt']};
    else if(url.includes('/stream/'))data={streams:[{title:'Film 1080p Dublado',url:'https://media.example/film.mp4'}]};
    else throw new Error('Native plugin must not request video');
    const text=data?JSON.stringify(data):'';
    return{status:200,url,headers:{get:key=>key==='content-type'?'video/mp4':null},arrayBuffer:async()=>bytes.buffer,text:async()=>text};
  };
  const plugin=sandbox({manifests:'https://source.example/manifest.json',qualities:'1080',settleMs:'0'},fetch);
  const streams=await plugin.getStreams('123','movie');assert.equal(streams.length,1);assert.equal(streams[0].quality,'1080p');
  assert.equal(calls.some(x=>x.url.startsWith('https://media.example/')),false);
  assert.equal(calls.some(x=>x.options.method==='HEAD' || x.options.headers.Range),false);
});

test('native plugin ignores legacy probes in saved settings, presets and advanced JSON',async()=>{
  for(const mode of ['sample','head','off']){
    const calls=[],stats=[];
    const fetch=async(url,options)=>{
      calls.push({url,options});
      if(url.startsWith('https://media.example/'))throw new Error('Video request forbidden');
      const data=url.includes('themoviedb')?{imdb_id:'tt123'}:url.endsWith('manifest.json')?
        {name:'Source',id:'source',types:['movie'],resources:['stream'],idPrefixes:['tt']}:
        {streams:Array.from({length:30},(_,i)=>({title:'1080p Dublado',url:'https://media.example/'+i+'.mp4',speedMbps:i+1}))};
      return{status:200,url,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array(0).buffer,text:async()=>JSON.stringify(data)};
    };
    for(const layer of ['saved','preset','advanced']){
      const stale={probeMode:mode,allowUnverified:false,maxProbes:1};
      const settings={manifests:'https://source.example/manifest.json',resultMode:'all'};
      if(layer==='saved')Object.assign(settings,stale);
      if(layer==='advanced')settings.advancedJson=JSON.stringify(stale);
      const rows=await sandbox(settings,fetch,layer==='preset'?stale:{},stats).getStreams('123','movie');
      assert.equal(rows.length,30,mode+' / '+layer);
      assert.equal(rows[0].url,'https://media.example/29.mp4');
      assert.match(rows[0].name,/fonte informa/);
      assert.equal(stats.at(-1).probes,0);
    }
    assert.equal(calls.some(x=>x.url.startsWith('https://media.example/')),false);
    assert.equal(calls.some(x=>x.options.method==='HEAD' || x.options.headers.Range),false);
  }
});

function qualityPlugin(settings){
  const fetch=async url=>{
    const data=url.includes('themoviedb')?{imdb_id:'tt123'}:url.endsWith('manifest.json')?
      {name:'Source',id:'source',types:['movie'],resources:['stream'],idPrefixes:['tt']}:
      {streams:[2160,1080,720,480,0].map(q=>({quality:q,title:'PT-BR',url:'https://media.example/'+q+'.mp4'}))};
    return{status:200,url,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array(0).buffer,text:async()=>JSON.stringify(data)};
  };
  return sandbox({manifests:'https://source.example/manifest.json',...settings},fetch);
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

test('native settings accept a configured manifest with internal commas',async()=>{
  const url='https://torrentio.strem.fun/qualityfilter=threed,480p,scr,cam,unknown|torbox=TEST_ONLY/manifest.json';
  const rows=await qualityPlugin({manifests:url,qualities:'1080'}).getStreams('123','movie');
  assert.deepEqual(Array.from(rows,row=>row.quality),['1080p']);
});

test('combined and standalone manifests expose suppliers named after each quality and load colocated bundles',()=>{
  const path=require('node:path'),manifest=require('../manifest.json');
  assert.deepEqual(manifest.scrapers.map(s=>s.name),['4K','Full HD','HD','SD','Qualidade desconhecida']);
  for(const scraper of manifest.scrapers){
    const standalone=require('../'+scraper.filename.replace('provider.js','manifest.json'));
    assert.equal(standalone.scrapers.length,1);assert.equal(standalone.scrapers[0].id,scraper.id);
    assert.equal(standalone.scrapers[0].filename,'provider.js');
    const own=path.resolve(__dirname,'..',scraper.filename);
    assert.equal(fs.existsSync(own),true);
    const plugin=sandbox({},()=>{}, {},[], '../'+scraper.filename);
    assert.equal(plugin.onSettings().some(field=>/^quality\d+$/.test(field.key||'')),false);
    assert.equal(plugin.onSettings().some(field=>field.key==='torboxApiKey'),true);
  }
});

test('each quality bundle returns only its own quality even with old toggles and conflicting advanced JSON',async()=>{
  const manifest=require('../manifest.json'),qualities=['4K','1080p','720p','480p','Qualidade desconhecida'];
  const fetch=async url=>{
    const data=url.includes('themoviedb')?{imdb_id:'tt123'}:url.endsWith('manifest.json')?
      {id:'source',resources:['stream'],types:['movie'],idPrefixes:['tt']}:
      {streams:[2160,1080,720,480,0].flatMap(q=>[1,2].map(n=>({quality:q,title:'PT-BR',url:'https://media.example/'+q+'-'+n+'.mp4'})))};
    return {status:200,url,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array(0).buffer,text:async()=>JSON.stringify(data)};
  };
  for(const [index,scraper] of manifest.scrapers.entries()){
    const settings={manifests:'https://source.example/manifest.json',quality2160:true,quality1080:false,qualities:[2160],advancedJson:'{"qualities":[]}',settleMs:0};
    const rows=await sandbox(settings,fetch,{},[],'../'+scraper.filename).getStreams('123','movie');
    assert.equal(rows.length,2);assert.deepEqual(Array.from(rows,row=>row.quality),[qualities[index],qualities[index]]);
  }
});

test('native generated bundle passes TorBox POST bodies and returns resolved HTTP without leaking the key',async()=>{
  const hash='a'.repeat(40),key='TEST_KEY_NOT_A_CREDENTIAL',calls=[];
  const fetch=async(url,options)=>{
    calls.push({url,options});let data;
    if(url.includes('api.torbox.app')){
      assert.equal(options.headers.Authorization,'Bearer '+key);
      if(url.includes('checkcached')){assert.deepEqual(JSON.parse(options.body),{hashes:[hash]});data={[hash]:{hash}};}
      if(url.includes('createtorrent')){assert.match(options.body,/name="magnet"/);data={torrent_id:4};}
      if(url.includes('mylist'))data={id:4,hash,files:[{id:9,name:'Movie.1080p.mkv',size:12345}]};
      if(url.includes('requestdl'))data='https://cdn.example/film.mkv';
      data={success:true,data};
    }else if(url.includes('themoviedb'))data={imdb_id:'tt123'};
    else if(url.endsWith('manifest.json'))data={id:'source',resources:['stream'],types:['movie'],idPrefixes:['tt']};
    else data={streams:[{infoHash:hash,title:'Movie 1080p Dublado',fileIdx:0}]};
    return {status:200,url,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array(0).buffer,text:async()=>JSON.stringify(data)};
  };
  const rows=await sandbox({torboxApiKey:key,manifests:'https://source.example/manifest.json',settleMs:0},fetch,{},[],'../qualities/full-hd/provider.js').getStreams('123','movie');
  assert.equal(rows.length,1);assert.equal(rows[0].url,'https://cdn.example/film.mkv');
  assert.equal(rows[0].quality,'1080p');assert.equal(JSON.stringify(rows).includes(key),false);
  assert.equal(calls.some(c=>c.url.startsWith('https://cdn.example')),false);
});
