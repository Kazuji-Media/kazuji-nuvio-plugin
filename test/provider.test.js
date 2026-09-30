'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function sandbox(settings,fetch,defaults={},stats=[],filename='../providers/kazuji.js'){
  const context=vm.createContext({module:{exports:{}},console:{info(message){stats.push(JSON.parse(message.slice('[Kazuji] '.length)));},warn(){}},setTimeout,clearTimeout,AbortController,Uint8Array,TextEncoder,TMDB_API_KEY:'key',KAZUJI_DEFAULT_CONFIG:defaults,SCRAPER_SETTINGS:settings,fetch});
  vm.runInContext(fs.readFileSync(require.resolve(filename),'utf8'),context);
  return context.module.exports;
}
test('generated plugin exports the current Nuvio contract and settings schema',()=>{
  const plugin=sandbox({},()=>{});assert.equal(typeof plugin.getStreams,'function');
  const fields=plugin.onSettings();assert.equal(fields.some(x=>x.key==='manifests'),false);assert.ok(fields.some(x=>x.key==='allowedRatings'));
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
    const fields=plugin.onSettings();
    assert.equal(fields.filter(field=>field.key==='torboxApiKey').length,1);
    assert.equal(fields.some(field=>/^(sourceManifest_|sourceEnabled_)/.test(field.key||'') || ['manifests','useBuiltInSources','torboxMaxResolutions'].includes(field.key)),false);
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

test('quality supplier configures addons with one TorBox key, returns HTTP and never resolves torrents locally',async()=>{
  const key='TEST_ONLY_NOT_A_CREDENTIAL',calls=[],stats=[];
  const fetch=async(url,options)=>{
    calls.push({url,options});
    assert.equal(url.includes('api.torbox.app'),false);
    let data;
    if(options.method==='POST'){
      const body=JSON.parse(options.body);
      if(url.endsWith('/gerar')){assert.equal(body.torbox,key);assert.equal(body.torrentOnly,false);data={id:'indexa_TEST'};}
      else if(url.endsWith('/api/config')){assert.equal(body.debridConfig.torboxKey,key);assert.equal(body.enableP2P,false);assert.equal(body.qbitMode,'off');data={ok:true,userConfig:'prow_TEST'};}
      else if(url.endsWith('/encrypt-user-data')){assert.equal(body.streaming_provider.token,key);assert.equal(body.streaming_provider.only_show_cached_streams,true);data={status:'success',encrypted_str:'mf_TEST=='};}
      else throw new Error('Unexpected POST');
    }else if(url.includes('themoviedb'))data={imdb_id:'tt123'};
    else if(url.endsWith('manifest.json')){
      if(url.startsWith('https://comet.elfhosted.com/')){
        const config=JSON.parse(Buffer.from(decodeURIComponent(new URL(url).pathname.split('/')[1]),'base64').toString());
        assert.equal(config.debridServices[0].apiKey,key);assert.equal(config.enableTorrent,false);
      }
      data={id:'source',resources:['stream'],types:['movie'],idPrefixes:['tt']};
    }else {
      data={streams:[
        {url:'about:error',quality:1080},
        {infoHash:'a'.repeat(40),quality:1080},
        {url:'magnet:?xt=urn:btih:'+'a'.repeat(40),quality:1080},
        {url:'https://files.example/pack.torrent',quality:1080},
      ]};
      if(url.startsWith('https://comet.elfhosted.com/'))data.streams.push({quality:1080,title:'Dublado',url:'https://cdn.example/film.mkv',behaviorHints:{proxyHeaders:{request:{Referer:'https://cdn.example/'}}}});
      if(url.startsWith('https://froststream.cloutteam.com/'))data.streams.push({quality:1080,url:'https://public.example/film.mp4'});
      if(url.startsWith('https://indexabr.vercel.app/'))assert.ok(url.includes('/indexa_TEST/stream/'));
      if(url.startsWith('https://prowjack-delta.vercel.app/'))assert.ok(url.includes('/prow_TEST/stream/'));
      if(url.startsWith('https://mediafusion.elfhosted.com/'))assert.ok(url.includes('/mf_TEST%3D%3D/stream/'));
    }
    return {status:200,url,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array(0).buffer,text:async()=>JSON.stringify(data)};
  };
  const stale={manifests:'https://custom.example/manifest.json',useBuiltInSources:false,sourceEnabled_frost:false,sourceManifest_frost:'https://override.example/manifest.json',torboxMaxResolutions:12,torrentMode:'native'};
  const rows=await sandbox({...stale,torboxApiKey:key,settleMs:300,advancedJson:JSON.stringify(stale)},fetch,{},stats,'../qualities/full-hd/provider.js').getStreams('123','movie');
  assert.equal(rows.length,2);
  assert.ok(rows.every(row=>/^https:/.test(row.url)&&row.quality==='1080p'));
  assert.equal(JSON.stringify(rows).includes(key),false);assert.equal(JSON.stringify(stats).includes(key),false);
  assert.equal(calls.some(c=>/custom.example|override.example|cdn.example|public.example|files.example/.test(c.url)),false);
  assert.equal(calls.filter(c=>c.options.method==='POST').length,3);
  assert.equal(calls.filter(c=>c.url.endsWith('manifest.json')).length,19);
  assert.equal(rows.find(row=>row.url.includes('cdn.example')).headers.Referer,'https://cdn.example/');
});

test('a rejected TorBox addon does not stop public HTTP or fall back to its public torrent manifest',async()=>{
  const calls=[];
  const fetch=async(url,options)=>{
    calls.push(url);
    const publicSource=url.startsWith('https://froststream.cloutteam.com/');
    const data=url.includes('themoviedb')?{imdb_id:'tt123'}:url.endsWith('manifest.json')?{resources:['stream'],types:['movie'],idPrefixes:['tt']}:{streams:publicSource?[{quality:2160,url:'https://public.example/4k.mp4'}]:[]};
    return {status:publicSource||url.includes('themoviedb')?200:401,url,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array(0).buffer,text:async()=>JSON.stringify(data)};
  };
  const rows=await sandbox({torboxApiKey:'BAD_TEST_KEY',settleMs:300},fetch,{},[],'../qualities/4k/provider.js').getStreams('123','movie');
  assert.equal(rows.length,1);assert.equal(rows[0].url,'https://public.example/4k.mp4');
  assert.equal(calls.includes('https://torrentio.strem.fun/manifest.json'),false);
  assert.equal(calls.includes('https://indexabr.vercel.app/manifest.json'),false);
});
