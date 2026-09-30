'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createResolver,hashOf,selectFile}=require('../src/torbox');
const {quality,candidate,normalizeConfig}=require('../src/aggregator');
const HASH='a'.repeat(40),OTHER='b'.repeat(40);
const KEY='TEST_KEY_NOT_A_CREDENTIAL';
const ctx={type:'movie'};
function config(extra={}){return normalizeConfig({qualities:[1080],...extra});}
function harness({cached={[HASH]:{hash:HASH}},files=[{id:7,name:'Film.1080p.mkv',size:12345}],failure='',maxResolutions=4}={}) {
  const calls=[];
  const request=async(url,options)=>{
    calls.push({url,options});let data;
    assert.equal(options.headers.Authorization,'Bearer '+KEY);
    if(url.includes('checkcached'))data=cached;
    if(url.endsWith('createtorrent'))data={torrent_id:23};
    if(url.includes('mylist'))data={id:23,hash:HASH,files};
    if(url.includes('requestdl'))data='https://cdn.torbox.example/movie.mkv?signature=example';
    return {status:failure && url.includes(failure)?401:200,text:JSON.stringify({success:true,error:null,data})};
  };
  const resolve=createResolver({apiKey:KEY,quality,maxResolutions,eligible:(s,c)=>!!candidate(s,'test',{...c,torrentMode:'native'},'stremio')});
  return {calls,resolve,request};
}
test('TorBox normalizes hexadecimal, base32, magnet and clientResolve hashes',()=>{
  assert.equal(hashOf({infoHash:HASH.toUpperCase()}),HASH);
  assert.equal(hashOf({infoHash:'A'.repeat(32)}),'0'.repeat(40));
  assert.equal(hashOf({url:'magnet:?xt=urn:btih:'+HASH+'&dn=film'}),HASH);
  assert.equal(hashOf({clientResolve:{stream:{raw:{infoHash:HASH}}}}),HASH);
  assert.equal(hashOf({infoHash:'invalid'}),'');
});
test('cached torrents become signed HTTP links with multipart bodies and real file IDs',async()=>{
  const h=harness();
  const streams=await h.resolve([{infoHash:HASH,quality:1080,fileIdx:0,title:'1080p PT-BR',sources:['tracker:https://tracker.example'],behaviorHints:{proxyHeaders:{request:{Authorization:'upstream'}}}}],{ctx,config:config(),request:h.request});
  assert.equal(streams.length,1);assert.match(streams[0].url,/^https:\/\/cdn/);
  assert.equal(streams[0].infoHash,undefined);assert.equal(streams[0].sources,undefined);
  assert.equal(streams[0].behaviorHints.proxyHeaders,undefined);
  assert.equal(streams[0].behaviorHints.filename,'Film.1080p.mkv');
  assert.equal(streams[0].behaviorHints.videoSize,12345);
  assert.equal(JSON.stringify(streams).includes(KEY),false);
  assert.equal(h.calls.length,4);
  assert.deepEqual(JSON.parse(h.calls[0].options.body),{hashes:[HASH]});
  const creation=h.calls.find(c=>c.url.endsWith('createtorrent'));
  assert.match(creation.options.headers['Content-Type'],/^multipart\/form-data; boundary=/);
  assert.match(creation.options.body,/name="add_only_if_cached"\r\n\r\ntrue/);
  assert.match(creation.options.body,/name="allow_zip"\r\n\r\nfalse/);
  assert.match(h.calls.at(-1).url,/file_id=7/);
});
test('uncached, invalid auth and absent key never create torrents or suppress direct streams',async()=>{
  const direct={url:'https://media.example/film.mp4',quality:1080};
  const torrent={infoHash:HASH,quality:1080};
  for(const options of [{cached:{}},{failure:'checkcached'}]) {
    const h=harness(options);
    assert.deepEqual(await h.resolve([torrent,direct],{ctx,config:config(),request:h.request}),[direct]);
    assert.equal(h.calls.length,1);
  }
  const resolve=createResolver({apiKey:'',quality});
  assert.deepEqual(await resolve([torrent,direct],{ctx,config:config(),request:()=>{throw new Error('Must not call TorBox');}}),[direct]);
});
test('cache, torrent registration and signed links are reused across duplicate source batches',async()=>{
  const h=harness(),stream={infoHash:HASH,quality:1080};
  const rows=await Promise.all([h.resolve([stream,stream],{ctx,config:config(),request:h.request}),h.resolve([stream],{ctx,config:config(),request:h.request})]);
  assert.equal(rows[0].length,2);assert.equal(rows[1].length,1);
  assert.equal(h.calls.filter(c=>c.url.includes('checkcached')).length,1);
  assert.equal(h.calls.filter(c=>c.url.endsWith('createtorrent')).length,1);
  assert.equal(h.calls.filter(c=>c.url.includes('requestdl')).length,1);
});
test('quality, audio and codec filters run before spending TorBox API calls',async()=>{
  const h=harness();
  const streams=[{infoHash:HASH,quality:2160},{infoHash:HASH,quality:1080,audioLanguage:'en'},{infoHash:HASH,quality:1080,videoCodec:'hevc',audioLanguage:'pt-BR'}];
  const rows=await h.resolve(streams,{ctx,config:config({languageMode:'strict',allowUnknownLanguage:false,allowedCodecs:['h264']}),request:h.request});
  assert.equal(rows.length,0);assert.equal(h.calls.length,0);
});
test('movie file selection excludes samples and series must match the requested episode',()=>{
  const files=[{id:88,name:'Show.S01E01.1080p.mkv',size:1000},{id:99,name:'Show.S01E02.1080p.mkv',size:2000},{id:100,name:'Sample.1080p.mp4',size:3000}];
  assert.equal(selectFile(files,{fileIdx:0},{type:'series',season:1,episode:2}).id,99);
  assert.equal(selectFile(files,{}, {type:'series',season:1,episode:3}),null);
  assert.equal(selectFile(files,{behaviorHints:{filename:files[0].name}},{type:'series',season:1,episode:2}).id,99);
  assert.equal(selectFile(files,{},ctx).id,99);
  assert.equal(selectFile([{id:1,name:'cover.jpg'}],{},ctx),null);
});
test('a selected cached file from a different quality is rejected before link generation',async()=>{
  const h=harness({files:[{id:7,name:'Film.720p.mkv',size:100}]});
  assert.deepEqual(await h.resolve([{infoHash:HASH,quality:1080}],{ctx,config:config(),request:h.request}),[]);
  assert.equal(h.calls.some(c=>c.url.includes('requestdl')),false);
});
test('registration budget is shared across sources and TorBox failure preserves HTTP links',async()=>{
  const h=harness({cached:{[HASH]:{hash:HASH},[OTHER]:{hash:OTHER}},maxResolutions:1});
  await h.resolve([{infoHash:HASH,quality:1080},{infoHash:OTHER,quality:1080}],{ctx,config:config(),request:h.request});
  assert.equal(h.calls.filter(c=>c.url.endsWith('createtorrent')).length,1);
  const bad=harness({failure:'requestdl'}),direct={url:'https://media.example/video.mp4'};
  assert.deepEqual(await bad.resolve([direct,{infoHash:HASH,quality:1080}],{ctx,config:config(),request:bad.request}),[direct]);
});

test('HTTP torrent file URLs with known hashes are resolved and existing HTTP/clientResolve metadata is preserved',async()=>{
  const h=harness(),direct={url:'https://media.example/video.mp4',quality:1080,clientResolve:{stream:{raw:{parsed:{codec:'HEVC'}}}}};
  const rows=await h.resolve([direct,{url:'https://indexer.example/film.torrent',infoHash:HASH,quality:1080}],{ctx,config:config(),request:h.request});
  assert.equal(rows.length,2);assert.equal(rows[0],direct);assert.match(rows[1].url,/^https:\/\/cdn/);
});
