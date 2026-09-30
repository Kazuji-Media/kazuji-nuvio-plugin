'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAggregator,normalizeConfig,quality,audioLanguages,supports,resourceUrl,resolveHttpUrl}=require('../src/aggregator');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const manifest={id:'test',name:'Example',types:['movie','series'],resources:['stream'],idPrefixes:['tt']};
function response(value,headers={},url='https://source.example/video.mp4'){
  const bytes=value instanceof Uint8Array?value:new TextEncoder().encode(JSON.stringify(value));
  return{status:200,url,headers,bytes,text:value instanceof Uint8Array?'':JSON.stringify(value),truncated:false};
}
function setup({streams={},delays={},errors={},meta={},output='native',key='test-key',probe,config={}}={}){
  const calls=[];
  const request=async(url,opts)=>{
    calls.push({url,opts,time:Date.now()});
    if(delays[url])await delay(delays[url]);
    if(errors[url])throw new Error('Upstream failed');
    if(url.includes('api.themoviedb.org'))return response(Object.assign({imdb_id:'tt123',external_ids:{imdb_id:'tt123'}},meta));
    if(url.includes('manifest.json'))return response(manifest,{},url);
    if(url.includes('/stream/'))return response({streams:streams[new URL(url).hostname]||[]});
    if(probe)return probe(url,opts);
    await delay(4);
    return response(new Uint8Array(262144),{'content-type':'video/mp4'},url);
  };
  const engine=createAggregator({request,output,tmdbApiKey:key});
  const settings=Object.assign({manifests:['https://a.example/manifest.json'],qualities:[2160,1080,720,480],resultMode:'per_quality',settleMs:60,totalTimeoutMs:500},config);
  return{calls,engine,run:(input={id:'123',type:'movie'})=>engine.aggregate(input,settings)};
}
function stream(q,url='https://video.example/'+q+'.mp4',extra={}){return Object.assign({url,title:'Example '+q+'p PT-BR'},extra);}

function matchedFusionNames(row){
  const pack=require('../badges.json');
  const text=[row.name,row.title,row.description,row.behaviorHints && row.behaviorHints.filename].filter(Boolean).join(' ');
  return pack.filters.filter(f=>{
    const flags=/^\(\?([is]+)\)/.exec(f.pattern);
    return new RegExp(f.pattern.replace(/^\(\?[is]+\)/,''),flags?flags[1]:'').test(text);
  }).map(f=>f.name);
}
test('derived Fusion pack preserves reference artwork and colors with enabled resolution defaults',()=>{
  const base=require('../badges.base.json'),derived=require('../badges.json');
  assert.equal(base.filters.length,20);assert.equal(derived.filters.length,54);
  assert.equal(new Set(derived.filters.map(f=>f.id)).size,54);
  for(const original of base.filters){
    const filter=derived.filters.find(f=>f.id===original.id);assert.ok(filter,original.id);
    for(const key of ['name','imageURL','borderColor','tagColor','textColor'])assert.equal(filter[key],original[key],original.id+': '+key);
    assert.equal(filter.isEnabled,true);assert.equal(filter.tagStyle,'filled');
  }
  assert.equal(base.filters.filter(f=>!f.isEnabled).length,3);
});
test('polished complements reuse collection icons and version font-independent vector artwork',()=>{
  const fs=require('node:fs'),path=require('node:path'),pack=require('../badges.json');
  for(const name of ['WEB-DL','SDR','6.1'])assert.ok(pack.filters.find(f=>f.name===name).imageURL.startsWith('https://raw.githubusercontent.com/'));
  const local=pack.filters.filter(f=>f.imageURL.startsWith('https://joaovpimenta.github.io/kazuji-media/'));
  assert.equal(local.length,31);
  for(const filter of local){
    const asset=new URL(filter.imageURL).pathname.split('/').pop();assert.match(asset,/-v2\.svg$/);
    const svg=fs.readFileSync(path.join(__dirname,'../assets/fusion',asset),'utf8');
    assert.doesNotMatch(svg,/<text\b|font-family/);assert.match(svg,/height="80"/);assert.match(svg,/<path\b/);
  }
});
test('derived Fusion rules recognize multiline labels and preserve Atmos/codec and DV/HDR10 pairs',async()=>{
  const s=setup({streams:{'a.example':[stream(2160,undefined,{behaviorHints:{filename:'Movie.2160p.BluRay.Remux.DV.HDR10.TrueHD.Atmos.7.1.mkv'}})]},config:{probeMode:'off',allowUnverified:true}});
  const row=(await s.run()).streams[0],badges=matchedFusionNames(row);
  for(const name of ['Remux','DV','HDR10','TrueHD','Atmos','7.1'])assert.ok(badges.includes(name),name);
  assert.equal(badges.includes('BluRay'),false);
  assert.equal(badges.includes('DD'),false);
  assert.equal(row.title.split('\n').length,3);
  for(const channels of ['8.0','5.0','35.1']){
    const labels=matchedFusionNames({title:'Film 1080p\n'+channels});
    assert.equal(labels.includes('7.1'),false);assert.equal(labels.includes('5.1'),false);
  }
});
test('Fusion defaults preserve technical metadata and match the bundled badges in native and HTTP output',async()=>{
  for(const output of ['native','stremio']){
    const filename='Movie.2160p.WEB-DL.x265.HDR10+.DDP5.1.Atmos.IMAX.10bit.mkv';
    const hints={filename,videoSize:4500000000,bingeGroup:'keep',videoHash:'hash'};
    const s=setup({output,streams:{'a.example':[stream(2160,undefined,{audioLanguages:['pt-BR','en'],behaviorHints:hints})]},config:{probeMode:'off',allowUnverified:true}});
    const row=(await s.run()).streams[0];
    const badges=matchedFusionNames(row);
    for(const name of ['4K','WEB-DL','HEVC','HDR10+','DD+','5.1','Atmos','IMAX','10bit','PT-BR','MULTI AUDIO'])assert.ok(badges.includes(name),output+': '+name);
    assert.equal(badges.includes('HDR10'),false);assert.equal(badges.includes('Dolby Digital'),false);
    assert.match(row.title,/4.5 GB/);
    if(output==='native'){assert.equal(row.size,'4.5 GB');assert.equal(row.name,row.title);}
    else {assert.deepEqual(row.behaviorHints,hints);assert.equal(row.description,row.title);}
    assert.deepEqual(hints,{filename,videoSize:4500000000,bingeGroup:'keep',videoHash:'hash'});
  }
});
test('Fusion uses clientResolve parsed metadata and an actual filename without inventing HDR or channels',async()=>{
  const s=setup({output:'stremio',streams:{'a.example':[{url:'https://video.example/film',clientResolve:{stream:{raw:{filename:'Movie.mkv',parsed:{resolution:'1080p',quality:'BluRay',codec:'h264',audio:['AAC'],languages:['pt-BR']}}}}}]},config:{probeMode:'off',allowUnverified:true}});
  const row=(await s.run()).streams[0],badges=matchedFusionNames(row);
  assert.equal(row.behaviorHints.filename,'Movie.mkv');
  for(const name of ['1080p','BluRay','AVC','AAC','PT-BR'])assert.ok(badges.includes(name),name);
  assert.equal(badges.some(x=>/HDR|SDR|Atmos|5\.1|Dolby Vision/.test(x)),false);
  assert.equal(row.behaviorHints.videoSize,undefined);
});
test('unknown metadata remains unknown even with HDR-capable titles, subtitles and speed declarations',async()=>{
  const s=setup({streams:{'a.example':[stream(1080,undefined,{title:'1080p',subtitles:[{url:'https://subs.example/pt.vtt',language:'pt-BR'}],speedMbps:35.1,size:-1})]},config:{probeMode:'off',allowUnverified:true}});
  const row=(await s.run()).streams[0];assert.deepEqual(matchedFusionNames(row),['1080p']);
  assert.equal(row.size,undefined);assert.equal(row.language,'Desconhecido');
});
test('formatted sizes use explicit decimal/binary units and partial response length never becomes file size',async()=>{
  for(const [size,expected]of [['4.5 GB',4500000000],['4,5 GiB',4831838208],[4500000000,4500000000]]){
    const s=setup({output:'stremio',streams:{'a.example':[stream(1080,undefined,{size})]},config:{probeMode:'off',allowUnverified:true}});
    assert.equal((await s.run()).streams[0].behaviorHints.videoSize,expected);
  }
  for(const [range,expected]of [['bytes 0-262143/9000000000',9000000000],['bytes 0-262143/*',undefined],['bytes 0-262143/100',undefined]]){
    const s=setup({output:'stremio',streams:{'a.example':[stream(1080)]},probe:async url=>{
      await delay(3);return {...response(new Uint8Array(262144),{'content-type':'video/mp4','content-length':'262144','content-range':range},url),status:206};
    }});
    assert.equal((await s.run()).streams[0].behaviorHints.videoSize,expected);
  }
});
test('HLS segment size is never used as total video size',async()=>{
  const s=setup({output:'stremio',streams:{'a.example':[stream(1080,'https://video.example/play.m3u8')]},probe:async url=>{
    if(url.endsWith('.m3u8'))return {status:200,url,text:'#EXTM3U\n#EXTINF:10\nsegment.ts',headers:{},truncated:false};
    await delay(3);return {...response(new Uint8Array(262144),{'content-type':'video/mp2t','content-range':'bytes 0-262143/500000','content-length':'262144'},url),status:206};
  }});
  assert.equal((await s.run()).streams[0].behaviorHints.videoSize,undefined);
});

test('normalizes settings, limits and JSON lists',()=>{
  const c=normalizeConfig({manifests:'["https://x.example/config/manifest.json?token=abc"]',qualities:'4k,1080p,720',totalTimeoutMs:99999,sourceConcurrency:0});
  assert.deepEqual(c.qualities,[2160,1080,720]);assert.equal(c.totalTimeoutMs,20000);assert.equal(c.sourceConcurrency,1);
  assert.equal(c.manifests[0],'https://x.example/config/manifest.json?token=abc');
  assert.throws(()=>normalizeConfig({manifests:['file:///etc/passwd']}));
  assert.throws(()=>normalizeConfig({qualities:'240p'}));
});
test('maps qualities and audio independently of subtitle language',()=>{
  assert.equal(quality({name:'UHD'}),2160);assert.equal(quality({title:'Film.1080p.mkv'}),1080);
  assert.equal(quality({quality:'1080p',name:'4K Provider'}),1080);
  assert.deepEqual(audioLanguages({subtitles:[{language:'pt-BR'}]}),[]);
  assert.ok(audioLanguages({title:'Film 720p Dublado'}).includes('pt-BR'));
});
test('honors stream resource types and prefixes, configured path and query',()=>{
  assert.equal(supports(manifest,'series','tt123:1:2'),true);
  assert.equal(supports(manifest,'movie','tmdb:123'),false);
  assert.equal(supports({types:['movie'],resources:[{name:'stream',types:['series'],idPrefixes:['tmdb:']}]},'series','tmdb:123:1:2'),true);
  assert.equal(resourceUrl('https://a.example/token/manifest.json?api=x','series','tt123:2:8'),'https://a.example/token/stream/series/tt123%3A2%3A8.json?api=x');
});
test('builds resource and HLS URLs without depending on a browser URL polyfill',()=>{
  assert.equal(resolveHttpUrl('../segments/a.ts','https://media.example/level/play.m3u8?token=x'),'https://media.example/segments/a.ts');
  assert.equal(resolveHttpUrl('//cdn.example/a.ts','https://media.example/play.m3u8'),'https://cdn.example/a.ts');
  assert.equal(resolveHttpUrl('?token=y','https://media.example/play.m3u8?token=x'),'https://media.example/play.m3u8?token=y');
  assert.throws(()=>resolveHttpUrl('data:abc','https://media.example/list.m3u8'));
  assert.throws(()=>normalizeConfig({manifests:['https://user:pass@host.example/manifest.json']}));
});
test('queries series with IMDb mapping, parallel sources and independent failures',async()=>{
  const s=setup({streams:{'a.example':[stream(1080)]},config:{manifests:['https://a.example/manifest.json','https://b.example/manifest.json'],qualities:[1080]},errors:{'https://b.example/manifest.json':true}});
  const result=await s.run({id:'tmdb:123:2:8',type:'tv'});
  assert.equal(result.streams.length,1);
  assert.ok(s.calls.some(x=>x.url.endsWith('/series/tt123%3A2%3A8.json')));
  const manifestCalls=s.calls.filter(x=>x.url.includes('manifest.json'));assert.ok(Math.abs(manifestCalls[0].time-manifestCalls[1].time)<30);
  assert.equal(result.stats.failures,1);
});
test('returns before a stalled source, aborts outstanding work and never mutates the result afterwards',async()=>{
  const slow='https://b.example/stream/movie/tt123.json';
  const s=setup({streams:{'a.example':[stream(1080)],'b.example':[stream(2160)]},delays:{[slow]:220},config:{manifests:['https://a.example/manifest.json','https://b.example/manifest.json'],settleMs:25}});
  const result=await s.run();assert.equal(result.streams.length,1);assert.ok(result.stats.elapsedMs<180);
  assert.ok(s.calls.every(x=>x.opts.signal.aborted));
  const before=JSON.stringify(result);await delay(250);assert.equal(JSON.stringify(result),before);
});
test('returns one approved winner for each quality sorted high first and deduplicates URLs',async()=>{
  const s=setup({streams:{'a.example':[stream(480),stream(720),stream(1080),stream(2160),stream(2160)]},config:{settleMs:100}});
  const result=await s.run();assert.deepEqual(result.streams.map(x=>x.quality),['4K','1080p','720p','480p']);
  assert.equal(result.stats.probes,4);
});
test('prefers selected audio among approved sources within the settle window',async()=>{
  const s=setup({streams:{'a.example':[stream(1080,'https://video.example/en',{title:'Film 1080p English'}),stream(1080,'https://video.example/pt')]}});
  assert.match((await s.run()).streams[0].url,/\/pt$/);
});
test('strict audio policy rejects known other audio and unknown when disabled',async()=>{
  const s=setup({streams:{'a.example':[stream(1080,'https://video.example/en',{title:'Film 1080p English'}),stream(720,'https://video.example/unknown',{title:'Film 720p'})]},config:{languages:'pt-BR',languageMode:'strict',allowUnknownLanguage:false}});
  assert.equal((await s.run()).streams.length,0);assert.equal(s.calls.filter(x=>x.opts.headers&&x.opts.headers.Range).length,0);
});
test('blocks disallowed/unknown movie certification before requesting any streams',async()=>{
  for(const meta of [{release_dates:{results:[{iso_3166_1:'BR',release_dates:[{certification:'18'}]}]}},{}]){
    const s=setup({meta,streams:{'a.example':[stream(1080)]},config:{allowedRatings:'L,10,12'}});
    const result=await s.run();assert.equal(result.streams.length,0);assert.equal(result.stats.ageBlocked,true);
    assert.equal(s.calls.filter(x=>x.url.includes('/stream/')).length,0);
  }
});
test('allows configured movie and TV ratings, conservatively blocks conflicting certifications',async()=>{
  const movie=setup({streams:{'a.example':[stream(1080)]},meta:{release_dates:{results:[{iso_3166_1:'BR',release_dates:[{certification:'12'}]}]}},config:{allowedRatings:'12'}});
  assert.equal((await movie.run()).streams.length,1);
  const tv=setup({streams:{'a.example':[stream(720)]},meta:{content_ratings:{results:[{iso_3166_1:'BR',rating:'10'}]}},config:{allowedRatings:'10'}});
  assert.equal((await tv.run({id:'123',type:'tv',season:1,episode:2})).streams.length,1);
  const conflict=setup({meta:{release_dates:{results:[{iso_3166_1:'BR',release_dates:[{certification:'12'},{certification:'18'}]}]}},config:{allowedRatings:'12'}});
  assert.equal((await conflict.run()).stats.ageBlocked,true);
});
test('explicit unknown-rating allow and no TMDB key still support IMDb addons',async()=>{
  const s=setup({key:'',streams:{'a.example':[stream(1080)]},config:{allowedRatings:'12',unknownRating:'allow'}});
  assert.equal((await s.run({id:'tt123',type:'movie'})).streams.length,1);
});
test('slow throughput fails the speed threshold instead of using declared file size',async()=>{
  const s=setup({streams:{'a.example':[stream(2160)]},probe:async url=>{await delay(25);return response(new Uint8Array(32768),{'content-type':'video/mp4','content-length':'999999999999'},url);}});
  assert.equal((await s.run()).streams.length,0);
});
test('failed HTTP and HTML masquerading as media are rejected even in fallback mode',async()=>{
  for(const probe of [async()=>({...response(new Uint8Array(262144)),status:403}),async()=>response(new Uint8Array(262144),{'content-type':'text/html'})]){
    const s=setup({streams:{'a.example':[stream(1080)]},probe,config:{allowUnverified:true}});
    assert.equal((await s.run()).streams.length,0);
  }
});
test('HEAD results are explicitly unverified and require fallback permission',async()=>{
  const s=setup({streams:{'a.example':[stream(1080)]},config:{probeMode:'head',allowUnverified:true}});
  assert.match((await s.run()).streams[0].title,/não verificada/);
  assert.ok(s.calls.some(x=>x.opts.method==='HEAD'));
});
test('respects probe concurrency and budgets while probing higher qualities first',async()=>{
  let active=0,maximum=0;
  const started=[];
  const s=setup({streams:{'a.example':[stream(480),stream(720),stream(1080),stream(2160)]},config:{probeConcurrency:2,maxProbes:3,settleMs:120},probe:async url=>{active++;maximum=Math.max(maximum,active);started.push(url);await delay(20);active--;return response(new Uint8Array(262144),{'content-type':'video/mp4'},url);}});
  const result=await s.run();assert.equal(maximum,2);assert.equal(result.stats.probes,3);assert.match(started[0],/2160/);assert.equal(result.streams.length,3);
});
test('preserves stream headers/subtitles without forwarding probe Range to the player',async()=>{
  const s=setup({streams:{'a.example':[stream(1080,undefined,{behaviorHints:{proxyHeaders:{request:{Referer:'https://site.example','User-Agent':'Player',Range:'bytes=4-8'}}},subtitles:[{url:'https://subs.example/sub.vtt',lang:'pob',headers:{Referer:'https://site.example'}},{url:'javascript:alert(1)'}]})]}});
  const result=await s.run();assert.equal(result.streams[0].headers.Referer,'https://site.example');assert.equal(result.streams[0].headers.Range,undefined);
  assert.equal(result.streams[0].subtitles.length,1);assert.equal(result.streams[0].subtitles[0].language,'pob');
  assert.equal(s.calls.find(x=>x.opts.headers&&x.opts.headers.Range).opts.headers.Referer,'https://site.example');
});
test('native debrid delegation preserves torrent file index, trackers and clientResolve only in HTTP mode',async()=>{
  const torrent={title:'Film 4K PT-BR',infoHash:'a'.repeat(40),fileIdx:3,sources:['tracker:udp://tracker.example:80'],behaviorHints:{filename:'Film.2160p.mkv',bingeGroup:'abc'},clientResolve:{service:'torbox',type:'torrent'}};
  const s=setup({output:'stremio',streams:{'a.example':[torrent]},config:{torrentMode:'native'}});
  const result=await s.run();assert.equal(result.streams.length,1);assert.equal(result.streams[0].fileIdx,3);assert.equal(result.streams[0].behaviorHints.bingeGroup,'abc');assert.deepEqual(result.streams[0].sources,torrent.sources);assert.match(result.streams[0].title,/sem teste/);assert.equal(result.stats.probes,0);
  const n=setup({streams:{'a.example':[torrent]},config:{torrentMode:'native',allowUnverified:true}});
  assert.equal((await n.run()).streams.length,0);
});
test('approved direct URLs take precedence over unresolved torrents of the same quality',async()=>{
  const s=setup({output:'stremio',streams:{'a.example':[{title:'1080p PT-BR',infoHash:'b'.repeat(40)},stream(1080)]},config:{torrentMode:'native'}});
  assert.ok((await s.run()).streams[0].url);
});
test('HLS follows matching rendition and tests its media segment with original headers',async()=>{
  const urls=[];
  const s=setup({streams:{'a.example':[stream(1080,'https://video.example/master.m3u8')]},probe:async(url,opts)=>{
    urls.push(url);
    if(url.endsWith('master.m3u8'))return{...response({}),url,text:'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080\nhigh/list.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480\nlow/list.m3u8\n'};
    if(url.endsWith('list.m3u8'))return{...response({}),url,text:'#EXTM3U\n#EXTINF:6.0,\nsegment.ts\n'};
    await delay(3);return response(new Uint8Array(262144),{'content-type':'video/mp2t'},url);
  }});
  assert.equal((await s.run()).streams.length,1);assert.equal(urls[2],'https://video.example/high/segment.ts');
});
test('HLS rejects an unavailable advertised resolution and does not call encrypted media segments',async()=>{
  for(const playlist of ['#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480\nlow.m3u8\n','#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:6,\nseg.ts\n']){
    const s=setup({streams:{'a.example':[stream(2160,'https://video.example/master.m3u8')]},probe:async url=>({...response({}),url,text:playlist})});
    assert.equal((await s.run()).streams.length,0);
  }
});
test('recognizes HLS at signed URLs without a filename extension',async()=>{
  const s=setup({streams:{'a.example':[stream(1080,'https://video.example/play?token=abc')]},probe:async url=>{
    if(url.includes('/play?'))return{...response({}),url,text:'#EXTM3U\n#EXTINF:6,\nsegment.ts\n',headers:{'content-type':'application/vnd.apple.mpegurl'}};
    await delay(3);return response(new Uint8Array(262144),{'content-type':'video/mp2t'},url);
  }});
  const result=await s.run();assert.equal(result.streams.length,1);assert.equal(result.streams[0].type,'hls');
});
test('absolute deadline returns even if transport never completes',async()=>{
  const engine=createAggregator({request:()=>new Promise(()=>{}),tmdbApiKey:'x'});
  const start=Date.now();const result=await engine.aggregate({id:'1',type:'movie'},{manifests:['https://a.example/manifest.json'],totalTimeoutMs:500});
  assert.equal(result.streams.length,0);assert.ok(Date.now()-start<1000);
});

test('defaults to one source per quality/audio group and inserts original audio before extra preferences',async()=>{
  const s=setup({meta:{original_language:'ja'},streams:{'a.example':[
    stream(1080,'https://video.example/en',{title:'1080p English'}),
    stream(2160,'https://video.example/ja4',{title:'4K Japanese'}),
    stream(1080,'https://video.example/ja',{title:'1080p Japanese'}),
    stream(2160,'https://video.example/pt4'),stream(1080,'https://video.example/pt'),
  ]},config:{resultMode:undefined,languages:'pt-BR,en',settleMs:120}});
  const result=await s.run();
  assert.deepEqual(result.streams.map(x=>x.url.split('/').pop()),['pt4','ja4','pt','ja','en']);
  assert.equal(normalizeConfig({}).resultMode,'per_language');
  const query=new URL(s.calls.find(x=>x.url.includes('/movie/123')).url);
  assert.equal(query.searchParams.get('language'),'pt-BR');assert.match(query.searchParams.get('append_to_response'),/credits/);
});
test('strict policy includes original audio but does not infer tracks from original language',async()=>{
  const s=setup({meta:{original_language:'ja'},streams:{'a.example':[
    stream(1080,'https://video.example/ja',{title:'1080p Japanese'}),
    stream(1080,'https://video.example/en',{title:'1080p English'}),
    stream(1080,'https://video.example/unknown',{title:'1080p',subtitles:[{language:'ja'}]}),
  ]},config:{languageMode:'strict',allowUnknownLanguage:false,resultMode:'all'}});
  assert.deepEqual((await s.run()).streams.map(x=>x.url),['https://video.example/ja']);
});
test('configures result quantity per group and all mode without duplicating multi-audio URLs',async()=>{
  for(const [resultMode,resultsPerGroup,count] of [['per_language',1,2],['per_language',2,3],['per_quality',1,1],['per_quality',2,2],['all',1,3]]){
    const s=setup({meta:{original_language:'ja'},streams:{'a.example':[
      stream(1080,'https://video.example/multi',{title:'1080p',audioLanguages:['pt-BR','ja']}),
      stream(1080,'https://video.example/pt'),
      stream(1080,'https://video.example/ja',{title:'1080p Japanese'}),
    ]},config:{resultMode,resultsPerGroup}});
    const result=await s.run();assert.equal(result.streams.length,count);
    assert.equal(new Set(result.streams.map(x=>x.url)).size,count);
  }
});
test('reported Mbps breaks speed ties without approving a source or overriding measured throughput',async()=>{
  const streams={'a.example':[stream(1080,'https://video.example/slow',{speedMbps:12}),stream(1080,'https://video.example/fast',{downloadSpeedMbps:50})]};
  const fallback=setup({streams,config:{probeMode:'off',allowUnverified:true}});
  assert.match((await fallback.run()).streams[0].url,/fast$/);
  const notApproved=setup({streams,config:{probeMode:'off'}});assert.equal((await notApproved.run()).streams.length,0);
  const measured=setup({streams,probe:async url=>{
    await delay(url.endsWith('/fast')?35:5);return response(new Uint8Array(262144),{'content-type':'video/mp4'},url);
  }});
  assert.match((await measured.run()).streams[0].url,/slow$/);
});
test('disabled probing performs no media requests and does not consume the probe budget',async()=>{
  const streams={'a.example':Array.from({length:30},(_,i)=>stream(1080,'https://video.example/'+i))};
  const s=setup({streams,config:{probeMode:'off',allowUnverified:true,resultMode:'all',maxProbes:1}});
  const result=await s.run();
  assert.equal(result.streams.length,30);assert.equal(result.stats.probes,0);
  assert.equal(s.calls.some(x=>x.url.startsWith('https://video.example/')),false);
});
test('ambiguous speed units are ignored and other audio never outranks preferred audio for speed',async()=>{
  const s=setup({meta:{original_language:'ja'},streams:{'a.example':[
    stream(1080,'https://video.example/ja',{title:'1080p Japanese',speedMbps:500}),
    stream(1080,'https://video.example/pt',{speed:999999}),
  ]},config:{resultMode:'all',probeMode:'off',allowUnverified:true}});
  const result=await s.run();assert.match(result.streams[0].url,/pt$/);
  assert.match(result.streams[0].name,/velocidade não verificada/);assert.match(result.streams[1].name,/fonte informa/);
});
test('formats native name in three lines with year, directors, studios and country certification',async()=>{
  const s=setup({streams:{'a.example':[stream(1080)]},meta:{title:'A Obra',release_date:'2024-07-01',original_language:'en',credits:{crew:[{job:'Director',name:'Diretora'},{job:'Editor',name:'Montador'}]},production_companies:[{name:'Estúdio'}],release_dates:{results:[{iso_3166_1:'BR',release_dates:[{certification:'12'}]}]}}});
  const row=(await s.run()).streams[0],lines=row.name.split('\n');
  assert.equal(lines.length,3);assert.match(lines[0],/^A Obra \(2024\) · 1080p/);
  assert.equal(lines[1],'Diretora · Estúdio');assert.match(lines[2],/^Classificação BR: 12/);
  assert.equal(row.title,row.name);assert.doesNotMatch(row.name,/Montador/);
});
test('series label uses creator, first air year and series certification',async()=>{
  const s=setup({streams:{'a.example':[stream(720)]},meta:{name:'Série',first_air_date:'2020-01-01',created_by:[{name:'Criador'}],production_companies:[{name:'Studio'}],content_ratings:{results:[{iso_3166_1:'BR',rating:'14'}]}}});
  const row=(await s.run({id:'123',type:'tv',season:1,episode:3})).streams[0];
  assert.match(row.name,/Série \(2020\)/);assert.match(row.name,/Criador · Studio\nClassificação BR: 14/);
});
test('missing metadata is explicit and never fabricates original language or age rating',async()=>{
  const s=setup({key:'',streams:{'a.example':[stream(1080,'https://video.example/unknown',{title:'1080p'})]}});
  const row=(await s.run({id:'tt123',type:'movie'})).streams[0];
  assert.match(row.name,/Título não informado · tt123 \(ano não informado\)/);
  assert.match(row.name,/Diretor\/criador não informado · Estúdio não informado/);
  assert.match(row.name,/Classificação BR: não informada/);assert.equal(row.language,'Desconhecido');
});
test('filters codec and HDR before probing and handles unknown compatibility explicitly',async()=>{
  const streams={'a.example':[
    stream(1080,'https://video.example/h264',{title:'1080p PT-BR x264 SDR'}),
    stream(1080,'https://video.example/hevc',{title:'1080p PT-BR HEVC HDR10'}),
    stream(1080,'https://video.example/dv',{title:'1080p PT-BR HEVC Dolby Vision'}),
    stream(1080,'https://video.example/unknown'),
  ]};
  for(const [config,expected] of [
    [{allowedCodecs:'h264',allowUnknownCompatibility:false},['h264']],
    [{hdrMode:'sdr',allowUnknownCompatibility:false},['h264']],
    [{hdrMode:'no_dolby_vision',allowUnknownCompatibility:false},['h264','hevc']],
    [{allowedCodecs:'h264',hdrMode:'sdr',allowUnknownCompatibility:true},['h264','unknown']],
  ]){
    const s=setup({streams,config:{...config,resultMode:'all'}}),result=await s.run();
    assert.deepEqual(result.streams.map(x=>x.url.split('/').pop()).sort(),expected.sort());
    assert.equal(result.stats.probes,expected.length);
  }
  assert.throws(()=>normalizeConfig({allowedCodecs:'mpeg2'}));
  assert.deepEqual(normalizeConfig({allowedCodecs:'H.264,x265,av01'}).allowedCodecs,['h264','hevc','av1']);
});
test('keeps collecting original audio after all qualities have initial winners',async()=>{
  const s=setup({meta:{original_language:'ja'},streams:{'a.example':[stream(1080)],'b.example':[stream(1080,'https://video.example/ja',{title:'1080p Japanese'})]},
    delays:{'https://b.example/stream/movie/tt123.json':30},config:{resultMode:'per_language',qualities:[1080],manifests:'https://a.example/manifest.json,https://b.example/manifest.json',settleMs:90}});
  assert.equal((await s.run()).streams.length,2);
});

test('uses declared speed to prioritize the probe budget within the same quality/audio group',async()=>{
  const s=setup({streams:{'a.example':[stream(1080,'https://video.example/slow',{speedMbps:10}),stream(1080,'https://video.example/fast',{speedMbps:80})]},config:{maxProbes:1}});
  const result=await s.run();assert.equal(result.stats.probes,1);assert.match(result.streams[0].url,/fast$/);
});
test('an English original is second to configured regional audio without inventing its region',async()=>{
  const s=setup({meta:{original_language:'en'},streams:{'a.example':[
    stream(1080,'https://video.example/ja',{title:'1080p Japanese'}),stream(1080,'https://video.example/en',{title:'1080p English'}),stream(1080,'https://video.example/pt'),
  ]},config:{resultMode:'per_language',languages:'pt-BR,ja'}});
  const result=await s.run();assert.deepEqual(result.streams.map(x=>x.language),['pt-BR','en','ja']);
  assert.equal(normalizeConfig({languages:''}).languages[0],'pt-BR');
});

test('preserves internal commas in configured manifest paths and queries while splitting actual URLs',()=>{
  const first='https://torrentio.strem.fun/language=portuguese|qualityfilter=threed,480p,scr,cam,unknown|limit=4|torbox=TEST_ONLY/manifest.json';
  const second='https://b.example/config;a,b/manifest.json?languages=pt,en';
  for(const input of [first,[first],JSON.stringify([first])]){
    assert.deepEqual(normalizeConfig({manifests:input}).manifests,[first]);
  }
  for(const separator of [',',', ', '; ', '\n','\r\n']){
    assert.deepEqual(normalizeConfig({manifests:first+separator+second}).manifests,[first,second]);
  }
  assert.equal(resourceUrl(first,'movie','tt123'),first.replace('manifest.json','stream/movie/tt123.json'));
  assert.equal(resourceUrl(second,'series','tt123:1:2'),second.replace('manifest.json','stream/series/tt123%3A1%3A2.json'));
  assert.deepEqual(normalizeConfig({qualities:'4k,1080p',languages:'pt-BR,en',allowedRatings:'L,12'}).qualities,[2160,1080]);
});
test('queries a raw configured Torrentio-style manifest without splitting its qualityfilter',async()=>{
  const url='https://torrentio.strem.fun/qualityfilter=threed,480p,scr,cam,unknown|torbox=TEST_ONLY/manifest.json';
  const s=setup({streams:{'torrentio.strem.fun':[stream(1080)]},config:{manifests:url}});
  const result=await s.run();assert.equal(result.streams.length,1);
  assert.ok(s.calls.some(x=>x.url===url));
  assert.ok(s.calls.some(x=>x.url===url.replace('manifest.json','stream/movie/tt123.json')));
});

test('native direct HTTP survives a stalled optional debrid resolver and HTTP torrent files are not video',async()=>{
  const request=async(url)=>url.endsWith('manifest.json')?response(manifest):response({streams:[
    {url:'https://media.example/video.mp4',quality:1080},
    {url:'https://media.example/pack.torrent',quality:1080,infoHash:'a'.repeat(40)},
  ]});
  const engine=createAggregator({request,resolveStreams:()=>new Promise(()=>{})});
  const result=await engine.aggregate({id:'tt123',type:'movie'},{manifests:['https://source.example/manifest.json'],qualities:[1080],probeMode:'off',allowUnverified:true,settleMs:0,totalTimeoutMs:500});
  assert.equal(result.streams.length,1);assert.equal(result.streams[0].url,'https://media.example/video.mp4');
  assert.equal(result.stats.candidates,1);
});
