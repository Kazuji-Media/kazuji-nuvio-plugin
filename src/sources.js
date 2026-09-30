'use strict';

// Public HTTP sources and verified, automatic TorBox configuration contracts.
// No remote JavaScript is evaluated and no torrent is resolved by this plugin.
const KazujiCatalog = (() => {
  const profiles = [
    {id:'4k',name:'4K',quality:2160,enabled:true},
    {id:'full-hd',name:'Full HD',quality:1080,enabled:true},
    {id:'hd',name:'HD',quality:720,enabled:true},
    {id:'sd',name:'SD',quality:480,enabled:true},
    {id:'unknown',name:'Qualidade desconhecida',quality:0,enabled:false},
  ];
  // QuickJS does not require Node's Buffer or the browser's btoa.
  function base64(value,urlSafe) {
    const bytes=encodeURIComponent(JSON.stringify(value)).replace(/%([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result='';
    for(let i=0;i<bytes.length;i+=3){
      const a=bytes.charCodeAt(i),b=bytes.charCodeAt(i+1),c=bytes.charCodeAt(i+2);
      result+=alphabet[a>>2]+alphabet[((a&3)<<4)|(Number.isNaN(b)?0:b>>4)]+(Number.isNaN(b)?'=':alphabet[((b&15)<<2)|(Number.isNaN(c)?0:c>>6)])+(Number.isNaN(c)?'=':alphabet[c&63]);
    }
    return urlSafe?result.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):result;
  }
  const packed=(value,urlSafe)=>encodeURIComponent(base64(value,urlSafe));
  const sources = [
    ['frost','Frost Stream','https://froststream.cloutteam.com'],
    ['kingvod','King Vod','https://da5f663b4690-kingvod.baby-beamup.club'],
    ['bscine','BsCine','https://bscine.alwaysdata.net'],
    ['popplay','Pop Play','https://site--popplay--rg2h4m5nr425.code.run'],
    ['mico','Mico-Leão Dublado','https://27a5b2bfe3c0-stremio-brazilian-addon.baby-beamup.club'],
    ['zeus','Zeus','https://398fe185fed6-zeus.baby-beamup.club/v1-p1kv-q27'],
    ['unioflix','UnioFlix','https://bcf125302240-unioflix.baby-beamup.club'],
    ['nexus','Nexus','https://nexuszen.vercel.app'],
    ['torrentio','Torrentio','https://torrentio.strem.fun',key=>'providers=comando,bludv,micoleaodublado%7Clanguage=portuguese%7Cdebridoptions=nodownloadlinks,nocatalog%7Ctorbox='+encodeURIComponent(key)],
    ['brazuca','Brazuca Torrents','https://94c8cb9f702d-brazuca-torrents.baby-beamup.club',key=>'language=portuguese%7Cdebridoptions=nodownloadlinks,nocatalog%7Ctorbox='+encodeURIComponent(key)],
    ['comet','Comet','https://comet.elfhosted.com',key=>packed({debridServices:[{service:'torbox',apiKey:key}],enableTorrent:false,cachedOnly:true,removeTrash:true,deduplicateStreams:true})],
    ['meteor','Meteor','https://meteorfortheweebs.midnightignite.me',key=>packed({services:[{name:'torbox',apiKey:key}],cachedOnly:true,allowP2P:false,removeSamples:true,removeTrash:true},true)],
    ['torrentsdb','TorrentsDB','https://torrentsdb.com',key=>packed({torbox:key,debridoptions:['nodownloadlinks','nocatalog']})],
    ['jackettio','Jackettio','https://jackettio.elfhosted.com',key=>packed({debridId:'torbox',debridApiKey:key,qualities:[0,480,720,1080,2160],indexers:['all'],maxTorrents:20,hideUncached:true,forceCacheNextEpisode:false})],
    ['pipe','Pipe','https://pipe.boringways.workers.dev',key=>packed({tb:key,st:'http'},true)],
    ['corsaro','Corsaro Viola','https://icv.stremio-italia.eu',key=>packed({use_torbox:true,torbox_key:key,only_debrid_cache:true,full_ita:false,use_knaben:true,use_dhtindex:true},true)],
    ['indexabr','Indexa Br','https://indexabr.vercel.app',null,key=>({path:'/gerar',body:{torrentOnly:false,torbox:key},result:data=>data.id})],
    ['prowjack','ProwJack','https://prowjack-delta.vercel.app',null,key=>({path:'/api/config',body:{indexers:['all'],categories:['movie','series','anime'],maxResults:40,priorityLang:'pt-br',onlyDubbed:false,dedupe:true,enableCatalog:false,debrid:true,enableP2P:false,qbitMode:'off',debridConfig:{mode:'torbox',torboxKey:key,rdKey:''},addonName:'ProwJack [TB]'},result:data=>data.ok&&data.userConfig})],
    ['mediafusion','Media Fusion','https://mediafusion.elfhosted.com',null,key=>({path:'/encrypt-user-data',body:{streaming_provider:{service:'torbox',token:key,only_show_cached_streams:true,enable_watchlist_catalogs:false,use_mediaflow:false},enable_catalogs:false,enable_acestream_streams:false,enable_telegram_streams:false},result:data=>data.status==='success'&&data.encrypted_str})],
  ].map(([id,name,url,configure,setup])=>({id,name,url,kind:configure||setup?'torbox':'http',configure,setup}));
  // Successful opaque configuration references only, bounded to this JS runtime.
  const references=new Map();
  function createPlan(settings) {
    const rawKey=String(settings.torboxApiKey||'').trim();
    const key=rawKey.length<=512 && !/[\x00-\x20\x7f]/.test(rawKey)?rawKey:'';
    const factories=new Map(),manifests=[];
    for(const source of sources){
      if(source.kind==='torbox' && !key)continue;
      const url=source.url+(source.configure?'/'+source.configure(key):'')+'/manifest.json';
      manifests.push(url);
      if(source.setup)factories.set(url,source);
    }
    async function prepareManifest(url,request) {
      const source=factories.get(url);
      if(!source)return url;
      const cacheKey=source.id+'|'+key,cached=references.get(cacheKey);
      if(cached && cached.expires>Date.now())return cached.url;
      const setup=source.setup(key);
      const response=await request(source.url+setup.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(setup.body)});
      if(response.status<200 || response.status>=300 || response.truncated)throw new Error('Fonte indisponível');
      const id=setup.result(JSON.parse(response.text));
      // Never follow a server-supplied URL, traversal, or an error as a configuration.
      if(typeof id!=='string' || !/^[A-Za-z0-9_-]{1,8190}={0,2}$/.test(id))throw new Error('Configuração da fonte inválida');
      const resolved=source.url+'/'+encodeURIComponent(id)+'/manifest.json';
      if(references.size>=16)references.delete(references.keys().next().value);
      references.set(cacheKey,{url:resolved,expires:Date.now()+600000});
      return resolved;
    }
    // Old per-source switches, custom manifests, and advanced overrides are ignored.
    return {manifests,prepareManifest};
  }
  return {profiles,sources,createPlan};
})();
if(typeof module!=='undefined')module.exports=KazujiCatalog;
