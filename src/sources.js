'use strict';

// Shared static catalog. No credentials, imports, or account discovery at runtime.
const KazujiCatalog = (() => {
  const profiles = [
    {id:'4k',name:'4K',quality:2160,enabled:true},
    {id:'full-hd',name:'Full HD',quality:1080,enabled:true},
    {id:'hd',name:'HD',quality:720,enabled:true},
    {id:'sd',name:'SD',quality:480,enabled:true},
    {id:'unknown',name:'Qualidade desconhecida',quality:0,enabled:false},
  ];
  const sources = [
    ['frost','Frost Stream','https://froststream.cloutteam.com','direct',true],
    ['fenix','Fenix Flix','https://fenixflix.fenixhub.online/configure','direct',false],
    ['kingvod','King Vod','https://da5f663b4690-kingvod.baby-beamup.club/manifest.json','direct',true],
    ['bscine','BsCine','https://bscine.alwaysdata.net/manifest.json','direct',true],
    ['popplay','Pop Play','https://site--popplay--rg2h4m5nr425.code.run/manifest.json','direct',true],
    ['mico','Mico-Leão Dublado','https://27a5b2bfe3c0-stremio-brazilian-addon.baby-beamup.club/manifest.json','direct',true],
    ['bestcine','BestCine','https://bestcine.dpdns.org/','direct',false],
    ['superstream','SuperStream','https://da5f663b4690-superstream.baby-beamup.club','direct',false],
    ['zeus','Zeus','https://398fe185fed6-zeus.baby-beamup.club/v1-p1kv-q27','direct',true],
    ['saimuel','Saimuel','https://saimuelptbr-how6fvsx.manus.space','configured',false],
    ['unioflix','UnioFlix','https://bcf125302240-unioflix.baby-beamup.club','direct',true],
    ['betor','BeTor','https://stremio-betor.onrender.com/','torrent',false],
    ['nyaa','Nyaa Anime BR','https://stremio-br-anime.onrender.com/manifest.json','configured',false],
    ['indexabr','Indexa Br','https://indexabr.vercel.app','configured',false],
    ['brasilrd','BrasilRD','https://brasil-rd-oficial.oniko.org/configure','configured',false],
    ['brazuca','Brazuca Torrents','https://94c8cb9f702d-brazuca-torrents.baby-beamup.club','torrent',false],
    ['torrentio','Torrentio','https://torrentio.strem.fun/providers=comando,bludv,micoleaodublado%7Clanguage=portuguese/manifest.json','torrent',false],
    ['magneto','Magneto','https://magneto-jnv5.onrender.com/v1/configure','configured',false],
    ['prowjack','ProwJack','https://prowjack-delta.vercel.app/configure','configured',false],
    ['pengu','Pengu','https://pengu.uk/configure','configured',false],
    ['mediafusion','Media Fusion','https://mediafusion.elfhosted.com/app/configure','configured',false],
    ['piratebay','ThePirateBay','https://thepiratebay-plus.strem.fun/manifest.json','torrent',false],
    ['meteor','Meteor','https://meteorfortheweebs.midnightignite.me/configure','configured',false],
    ['corsaro','Corsaro Viola','https://icv.stremio-italia.eu/configure','torrent',false],
    ['comet','Comet','https://comet.elfhosted.com/configure','configured',false],
    ['orion','Orion','https://5a0d1888fa64-orion.baby-beamup.club/configure','configured',false],
    ['torrentsdb','TorrentsDB','https://torrentsdb.com/configure','torrent',false],
    ['jackettio','Jackettio','https://jackettio.elfhosted.com/configure','configured',false],
    ['pipe','Pipe','https://pipe.boringways.workers.dev','torrent',false],
    ['nexus','Nexus','https://nexuszen.vercel.app','direct',true],
  ].map(([id,name,url,kind,enabled]) => ({id,name,url,kind,enabled,
    // Configuration pages are kept as links, never queried as stream manifests.
    manifest:kind==='configured'?null:url.replace(/\/configure\/?$/,'').replace(/\/$/,'')+(url.endsWith('/manifest.json')?'':'/manifest.json'),
  }));
  const isOn = value => value===true || value==='true';
  function applySources(settings,normalize) {
    const config=Object.assign({},settings);
    const urls=normalize({manifests:settings.manifests}).manifests;
    if(settings.useBuiltInSources==null || settings.useBuiltInSources==='' || isOn(settings.useBuiltInSources)) {
      for(const source of sources) {
        const custom=String(settings['sourceManifest_'+source.id]||'').trim();
        const value=settings['sourceEnabled_'+source.id];
        const enabled=value==null || value==='' ? !!custom || source.enabled || (source.kind==='torrent' && !!String(settings.torboxApiKey||'').trim()) : isOn(value);
        if(!enabled)continue;
        if(source.kind==='torrent' && !custom && !String(settings.torboxApiKey||'').trim())continue;
        if(custom) urls.push(...normalize({manifests:custom}).manifests);
        else if(source.manifest) urls.push(source.manifest);
      }
    }
    config.manifests=[...new Set(urls)];
    return config;
  }
  return {profiles,sources,applySources};
})();
if(typeof module!=='undefined')module.exports=KazujiCatalog;
