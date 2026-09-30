'use strict';

// Direct TorBox API adapter for QuickJS. Credentials stay in local settings.
const KazujiTorBox = (() => {
  const API='https://api.torbox.app/v1/api/torrents/';
  function hashOf(stream) {
    const resolve=stream.clientResolve||{},raw=resolve.stream && resolve.stream.raw || {};
    let hash=String(stream.infoHash || resolve.infoHash || raw.infoHash || '').trim();
    if(!hash) {
      const match=/[?&]xt=urn(?::|%3a)btih(?::|%3a)([a-f0-9]{40}|[a-z2-7]{32})(?:&|$)/i.exec(stream.url||'');
      if(match)hash=match[1];
    }
    if(/^[a-f0-9]{40}$/i.test(hash))return hash.toLowerCase();
    if(!/^[a-z2-7]{32}$/i.test(hash))return '';
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits=0,value=0,out='';
    for(const ch of hash.toUpperCase()) {
      value=(value<<5)|alphabet.indexOf(ch);bits+=5;
      if(bits>=8){bits-=8;out+=((value>>>bits)&255).toString(16).padStart(2,'0');}
    }
    return out;
  }
  const nameOf=file=>String(file.name||file.short_name||file.shortName||file.absolute_path||'');
  const basename=name=>String(name).replace(/\\/g,'/').split('/').pop().toLowerCase();
  const video=file=>/\.(mkv|mp4|avi|mov|m4v|webm|ts|m2ts)$/i.test(nameOf(file)) && !/\b(sample|trailer|preview)\b/i.test(basename(nameOf(file)));
  function episodeMatches(file,ctx) {
    const name=nameOf(file);
    const patterns=[/\bs(\d{1,3})[ ._-]*e(\d{1,3})(?!\d)/ig,/\b(\d{1,3})x(\d{1,3})(?!\d)/ig];
    return patterns.some(re=>{let match;while((match=re.exec(name)))if(Number(match[1])===ctx.season && Number(match[2])===ctx.episode)return true;return false;});
  }
  function selectFile(files,stream,ctx) {
    if(!Array.isArray(files))return null;
    const usable=files.filter(f=>f && Number.isInteger(f.id) && f.id>=0 && video(f));
    const filename=stream.behaviorHints && stream.behaviorHints.filename || stream.filename || '';
    if(filename) {
      const exact=usable.filter(f=>basename(nameOf(f))===basename(filename));
      if(exact.length===1 && (ctx.type!=='series' || episodeMatches(exact[0],ctx)))return exact[0];
    }
    // Stremio fileIdx is a zero-based torrent index, not the TorBox file ID.
    if(stream.fileIdx!=null) {
      const index=Number(stream.fileIdx),file=Number.isInteger(index) && index>=0?files[index]:null;
      if(file && usable.includes(file) && (ctx.type!=='series' || episodeMatches(file,ctx)))return file;
    }
    if(ctx.type==='series') {
      const episodes=usable.filter(f=>episodeMatches(f,ctx));
      return episodes.length===1?episodes[0]:null;
    }
    return usable.slice().sort((a,b)=>(Number(b.size)||0)-(Number(a.size)||0))[0]||null;
  }
  function createResolver({apiKey,quality,eligible,maxResolutions=4,concurrency=2,warn=()=>{}}) {
    apiKey=String(apiKey||'').trim();
    const cache=new Map(),torrents=new Map(),links=new Map(),waiting=[];
    let active=0,used=0,disabled=false,notified=false;
    const limit=Math.min(12,Math.max(1,Number(maxResolutions)||4));
    const slots=Math.min(3,Math.max(1,Number(concurrency)||2));
    function drain(){while(active<slots && waiting.length){active++;waiting.shift()();}}
    async function scheduled(work) {
      await new Promise(resolve=>{waiting.push(resolve);drain();});
      try{return await work();}finally{active--;drain();}
    }
    async function call(path,request,options={}) {
      if(disabled)throw new Error('TorBox indisponível');
      const response=await request(API+path,{...options,headers:{Accept:'application/json',Authorization:'Bearer '+apiKey,...options.headers},maxBytes:1048576});
      if(response.status===401 || response.status===403 || response.status===429)disabled=true;
      if(response.status<200 || response.status>=300 || response.truncated)throw new Error('Resposta TorBox inválida');
      const body=JSON.parse(response.text);
      if(body.success!==true || body.error || body.data==null)throw new Error('TorBox não resolveu a fonte');
      return body.data;
    }
    async function getTorrent(hash,request) {
      if(!torrents.has(hash))torrents.set(hash,scheduled(async()=>{
        if(used>=limit || disabled)return null;
        used++;
        const boundary='KazujiTorBox'+hash;
        const fields={magnet:'magnet:?xt=urn:btih:'+hash,add_only_if_cached:'true',allow_zip:'false',seed:'3'};
        const body=Object.entries(fields).map(([key,value])=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+key+'"\r\n\r\n'+value+'\r\n').join('')+'--'+boundary+'--\r\n';
        const created=await call('createtorrent',request,{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary='+boundary},body});
        const id=created.torrent_id ?? created.id;
        if(!Number.isInteger(id) || id<0)return null;
        const data=await call('mylist?id='+id+'&bypass_cache=true',request);
        const torrent=Array.isArray(data)?data.find(t=>t.id===id):data;
        if(!torrent || torrent.id!==id || hashOf({infoHash:torrent.hash})!==hash)return null;
        return torrent;
      }).catch(()=>null));
      return torrents.get(hash);
    }
    async function resolveStreams(streams,{ctx,config,request}) {
      const isDirect=s=>s && /^https?:\/\//i.test(s.url||'') && !/\.torrent(?:[?#]|$)/i.test(s.url||'');
      const direct=streams.filter(isDirect);
      if(!apiKey || disabled)return direct;
      const candidates=streams.filter(s=>s && !isDirect(s) && hashOf(s) && config.qualities.includes(quality(s)) && (!eligible || eligible(s,config)));
      const hashes=[...new Set(candidates.map(hashOf))].slice(0,100);
      const missing=hashes.filter(hash=>!cache.has(hash));
      if(missing.length) {
        // One cache query per source batch; duplicate hashes share the same promise.
        const lookup=call('checkcached?format=object&list_files=true',request,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hashes:missing})});
        for(const hash of missing)cache.set(hash,lookup.then(data=>data && !Array.isArray(data) && Object.keys(data).some(key=>key.toLowerCase()===hash && data[key] && typeof data[key]==='object')).catch(()=>false));
      }
      const resolved=await Promise.all(candidates.map(async stream=>{
        const hash=hashOf(stream);
        if(!cache.has(hash) || !await cache.get(hash))return null;
        const torrent=await getTorrent(hash,request);
        if(!torrent)return null;
        const file=selectFile(torrent.files,stream,ctx);
        if(!file)return null;
        const fileQuality=quality({behaviorHints:{filename:nameOf(file)}});
        if(fileQuality && !config.qualities.includes(fileQuality))return null;
        const key=torrent.id+':'+file.id;
        if(!links.has(key))links.set(key,scheduled(()=>call('requestdl?token='+encodeURIComponent(apiKey)+'&torrent_id='+torrent.id+'&file_id='+file.id+'&zip_link=false&redirect=false&append_name=false',request)).catch(()=>null));
        const url=await links.get(key);
        if(typeof url!=='string' || !/^https:\/\//i.test(url))return null;
        const result={...stream,url,quality:fileQuality || stream.quality,behaviorHints:{...stream.behaviorHints,filename:nameOf(file),videoSize:Number(file.size)||undefined}};
        // Playback uses only the signed HTTP link and never upstream auth headers.
        delete result.infoHash;delete result.fileIdx;delete result.sources;delete result.clientResolve;delete result.headers;
        delete result.behaviorHints.proxyHeaders;
        return result;
      }));
      if(disabled && !notified){notified=true;warn('TorBox indisponível: confira a chave, o plano ou o limite de requisições. Fontes HTTP continuam disponíveis.');}
      return direct.concat(resolved.filter(Boolean));
    }
    return resolveStreams;
  }
  return {hashOf,selectFile,createResolver};
})();
if(typeof module!=='undefined')module.exports=KazujiTorBox;
