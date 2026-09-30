'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createAggregator,normalizeConfig}=require('./aggregator');
const {createNodeTransport}=require('./node-transport');
const {ConfigStore}=require('./config-store');
const VERSION=require('../package.json').version;
function manifest(config,id='default',publicUrl=''){
  return {id:'org.kazuji.media.'+id.slice(0,12),name:'Kazuji Media',version:VERSION,description:'Fontes por qualidade e idioma, créditos e classificação. Testes por amostra e TorBox opcional via Nuvio.',
    logo:publicUrl?new URL('/assets/logo.svg',publicUrl).href:'https://joaovpimenta.github.io/kazuji-media/assets/logo.svg',
    resources:[{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:']}],types:['movie','series'],catalogs:[],
    behaviorHints:{configurable:true,configurationRequired:!config.manifests.length}};
}
async function createServer(options={}) {
  const store=options.store||new ConfigStore(options.dataDir||process.env.DATA_DIR||path.join(process.cwd(),'data'));
  await store.load();
  const transport=options.request||createNodeTransport({allowPrivate:process.env.ALLOW_PRIVATE_UPSTREAMS==='true',allowHttp:process.env.ALLOW_HTTP_UPSTREAMS==='true'});
  const engine=createAggregator({request:transport,output:'stremio',tmdbApiKey:options.tmdbApiKey||process.env.TMDB_API_KEY||''});
  const defaultConfig=normalizeConfig(options.defaultConfig||{});
  const publicUrl=options.publicUrl||process.env.PUBLIC_URL||'';
  const limits=new Map();
  let active=0;
  function allowed(ip,cost){
    const time=Date.now();
    if(limits.size>4096)for(const[k,v]of limits)if(time-v.start>60000)limits.delete(k);
    let row=limits.get(ip);if(!row||time-row.start>60000){if(limits.size>=8192)return false;row={start:time,count:0};limits.set(ip,row);}
    row.count+=cost;return row.count<=120;
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    const send=(status,data)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    const url=new URL(req.url,'http://localhost');
    const controller=new AbortController();
    res.on('close',()=>controller.abort());
    try{
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      if(!allowed(req.socket.remoteAddress,url.pathname==='/api/config'?4:1)){send(429,{error:'Muitas solicitações'});return;}
      if(req.method==='GET'&&url.pathname==='/health'){send(200,{status:'ok',version:VERSION});return;}
      if(req.method==='GET'&&url.pathname==='/badges.json'){
        const badges=JSON.parse(await fs.readFile(path.join(__dirname,'../badges.json'),'utf8'));
        if(publicUrl)for(const filter of badges.filters){
          // Preserve original third-party PNG URLs from the reference pack.
          const prefix='https://joaovpimenta.github.io/kazuji-media/';
          if(filter.imageURL.startsWith(prefix))filter.imageURL=new URL('/'+filter.imageURL.slice(prefix.length),publicUrl).href;
        }
        send(200,badges);return;
      }
      if(req.method==='GET'&&/^\/assets\/(?:logo\.svg|fusion\/[a-z0-9-]+\.svg)$/.test(url.pathname)){
        let asset;
        try{asset=await fs.readFile(path.join(__dirname,'..',url.pathname.slice(1)));}catch(_){send(404,{error:'Emblema não encontrado'});return;}
        res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=86400'});res.end(asset);return;
      }
      if(req.method==='GET'&&['/','/configure'].includes(url.pathname)||req.method==='GET'&&/^\/c\/[a-f0-9]{48}\/configure$/.test(url.pathname)){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'"});res.end(await fs.readFile(path.join(__dirname,'../public/index.html')));return;
      }
      if(req.method==='GET'&&['/configure.js','/style.css'].includes(url.pathname)){
        res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8'});res.end(await fs.readFile(path.join(__dirname,'../public',url.pathname.slice(1))));return;
      }
      if(req.method==='POST'&&url.pathname==='/api/config'){
        // Only same-origin configuration pages may create persistent presets in browsers.
        if(req.headers.origin&&publicUrl&&new URL(publicUrl).origin!==req.headers.origin){send(403,{error:'Origem não permitida'});return;}
        let body='',bytes=0;
        for await(const chunk of req){bytes+=chunk.length;if(bytes>32768){send(413,{error:'Configuração grande demais'});return;}body+=chunk.toString('utf8');}
        let config;
        try{config=normalizeConfig(JSON.parse(body));}catch(_){send(400,{error:'Configuração inválida; confira URLs, listas e opções'});return;}
        if(!config.manifests.length){send(400,{error:'Informe pelo menos um manifesto'});return;}
        // Avoid self-recursion via the configured public host.
        if(publicUrl&&config.manifests.some(x=>new URL(x).origin===new URL(publicUrl).origin)){send(400,{error:'Não use o próprio Kazuji como fonte'});return;}
        const id=await store.create(config);
        send(201,{manifestPath:'/c/'+id+'/manifest.json'});return;
      }
      const match=/^(?:\/c\/([a-f0-9]{48}))?\/(manifest\.json|stream\/(movie|series)\/([^/]+)\.json)$/.exec(url.pathname);
      if(req.method!=='GET'||!match){send(404,{error:'Rota não encontrada'});return;}
      const config=match[1]?store.get(match[1]):defaultConfig;
      if(!config){send(404,{error:'Configuração não encontrada'});return;}
      if(match[2]==='manifest.json'){send(200,manifest(config,match[1],publicUrl||undefined));return;}
      if(active>=32){send(503,{error:'Servidor ocupado',streams:[]});return;}
      let id;
      try{id=decodeURIComponent(match[4]);require('./aggregator').parseInput(id,match[3]);}catch(_){send(400,{error:'ID de mídia inválido',streams:[]});return;}
      active++;
      try{
        const result=await engine.aggregate({id,type:match[3],signal:controller.signal},config);
        send(200,{streams:result.streams,cacheMaxAge:0,staleRevalidate:0,staleError:0});
        // Numeric diagnostics only: no manifest tokens, IDs or playback URLs.
        if(!options.quiet)console.info(JSON.stringify({event:'search',...result.stats}));
      }finally{active--;}
    }catch(_){send(500,{error:'Falha ao processar solicitação',streams:[]});}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  server.on('close',()=>{if(transport.close)transport.close();});
  return server;
}
if(require.main===module)(async()=>{
  let config={};if(process.env.KAZUJI_CONFIG_FILE)config=JSON.parse(await fs.readFile(process.env.KAZUJI_CONFIG_FILE,'utf8'));
  const server=await createServer({defaultConfig:config});
  const port=Number(process.env.PORT||7000);
  server.listen(port,process.env.HOST||'0.0.0.0',()=>console.info('Kazuji escutando na porta '+port));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close();setTimeout(()=>process.exit(0),5000).unref();});
})().catch(()=>{console.error('Falha ao iniciar. Confira configuração e diretório de dados.');process.exitCode=1;});
module.exports={createServer,manifest};
