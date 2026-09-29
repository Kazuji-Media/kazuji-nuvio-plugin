'use strict';
// Appended to aggregator.js by scripts/build.js; no external require at runtime.
const KazujiCore = module.exports;
const QUALITY_OPTIONS = [[2160,'4K'],[1080,'1080p'],[720,'720p'],[480,'480p'],[0,'Qualidade desconhecida']];

function baseQualities(settings) {
  // Preserve legacy text/preset selections when new toggles have not been saved.
  return KazujiCore.normalizeConfig({qualities:settings.qualities}).qualities;
}

function nativeTransport(maxConcurrent) {
  let active=0;
  const waiting=[];
  function drain() {
    while(active<maxConcurrent && waiting.length) {
      const job=waiting.shift();
      if(job.signal && job.signal.aborted){job.reject(new Error('Cancelado'));continue;}
      active++;job.resolve();
    }
  }
  return async function request(url,options) {
    const signal=options.signal;
    let timer, abortHandler;
    const work=(async()=>{
      await new Promise((resolve,reject)=>{waiting.push({resolve,reject,signal});drain();});
      try {
        if(signal && signal.aborted)throw new Error('Cancelado');
        const response=await fetch(url,{method:options.method||'GET',headers:options.headers||{},signal});
        const headers={};
        for(const key of ['content-type','content-range','content-length','accept-ranges','location']) headers[key]=response.headers.get(key)||'';
        const bytes=new Uint8Array(await response.arrayBuffer());
        const text=await response.text();
        return {status:response.status,url:response.url||url,headers,bytes:bytes.subarray(0,options.maxBytes),text,
          truncated:bytes.length>options.maxBytes || /\n\.\.\.\[truncated\]$/.test(text)};
      } finally {active--;drain();}
    })();
    // Nuvio currently ignores fetch's signal; keep the physical slot until fetch settles.
    // A timeout only stops awaiting it. The app disposes the runtime after getStreams.
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Tempo excedido')),options.timeoutMs);
      if(signal){abortHandler=()=>reject(new Error('Cancelado'));signal.addEventListener('abort',abortHandler);if(signal.aborted)abortHandler();}
    });
    try{return await Promise.race([work,timeout]);}
    finally{clearTimeout(timer);if(signal && abortHandler)signal.removeEventListener('abort',abortHandler);}
  };
}

async function getStreams(tmdbId,mediaType,season,episode) {
  if(typeof setTimeout!=='function' || typeof clearTimeout!=='function'){
    console.warn('[Kazuji] Runtime sem timers assíncronos. Instale a versão HTTP do Kazuji em Add-ons.');
    return [];
  }
  const settings=Object.assign({},globalThis.KAZUJI_DEFAULT_CONFIG||{},globalThis.SCRAPER_SETTINGS||{});
  if(QUALITY_OPTIONS.some(([q])=>settings['quality'+q]!=null)){
    const previous=baseQualities(settings);
    settings.qualities=QUALITY_OPTIONS.filter(([q])=>{
      const value=settings['quality'+q];
      return value==null?previous.includes(q):value===true || value==='true';
    }).map(([q])=>q);
  }
  if(settings.advancedJson){
    const extra=JSON.parse(settings.advancedJson);
    if(!extra || typeof extra!=='object' || Array.isArray(extra))throw new Error('Configuração avançada inválida');
    Object.assign(settings,extra);
  }
  const config=KazujiCore.normalizeConfig(settings);
  const engine=KazujiCore.createAggregator({request:nativeTransport(config.sourceConcurrency+config.probeConcurrency),output:'native',tmdbApiKey:globalThis.TMDB_API_KEY||''});
  const result=await engine.aggregate({id:String(tmdbId),type:mediaType,season,episode},config);
  console.info('[Kazuji] '+JSON.stringify(result.stats));
  return result.streams;
}

function onSettings() {
  function select(key,label,values,defaultValue,description){return{type:'select',key,label,description,defaultValue,options:values.map(x=>({label:x[0],value:x[1]}))};}
  function text(key,label,placeholder,description){return{type:'text',key,label,placeholder,description};}
  const selected=baseQualities(Object.assign({},globalThis.KAZUJI_DEFAULT_CONFIG||{},globalThis.SCRAPER_SETTINGS||{}));
  return [
    {type:'header',label:'Kazuji · Agregador'},
    text('manifests','Manifestos Stremio HTTP','https://addon.exemplo/manifest.json','Separe URLs por vírgula, ou use um array JSON. Inclua a configuração do próprio add-on na URL. Não aceita repositórios de plugins JavaScript.'),
    {type:'header',label:'Qualidades de vídeo · selecione uma ou mais'},
    ...QUALITY_OPTIONS.map(([q,label])=>({type:'toggle',key:'quality'+q,label,defaultValue:selected.includes(q)})),
    text('languages','Idioma principal e preferências extras','pt-BR','Configure o idioma do aparelho manualmente (padrão pt-BR). A ordem será: primeiro idioma, idioma original da obra no TMDB, depois os demais. Legendas não comprovam áudio.'),
    select('resultMode','Agrupamento dos resultados',[['Por qualidade e idioma','per_language'],['Por qualidade','per_quality'],['Todas as fontes válidas','all']],'per_language'),
    text('resultsPerGroup','Fontes por grupo','1','De 1 a 20; padrão 1. Ignorado em Todas as fontes válidas. Áudio múltiplo entra no grupo de maior preferência, sem duplicar a URL.'),
    select('languageMode','Filtro de idioma',[['Preferir','prefer'],['Somente preferências e idioma original','strict'],['Qualquer idioma, sem preferência','any']],'prefer'),
    {type:'toggle',key:'allowUnknownLanguage',label:'Aceitar áudio sem idioma informado',defaultValue:true},
    text('allowedCodecs','Codecs permitidos','h264,hevc,av1','Vazio aceita todos. Configure conforme seu aparelho. Usa apenas informações declaradas pela fonte; não detecta capacidades do dispositivo.'),
    select('hdrMode','Compatibilidade HDR',[['Qualquer formato','any'],['Somente SDR','sdr'],['Excluir Dolby Vision','no_dolby_vision']],'any'),
    {type:'toggle',key:'allowUnknownCompatibility',label:'Aceitar codec/HDR não informado',defaultValue:true,description:'Aplica-se quando um filtro de codec/HDR está ativo.'},
    text('allowedRatings','Classificações permitidas','L,10,12','Vazio desativa o filtro. Use os códigos do país escolhido. Padrão BR: L,10,12,14,16,18. Bloqueia todo o título quando não permitido.'),
    text('country','País da classificação','BR','Código ISO: BR, US, GB, etc. Padrão BR.'),
    select('unknownRating','Título sem classificação',[['Bloquear','block'],['Permitir','allow']],'block','Aplicado quando há classificações permitidas configuradas.'),
    select('probeMode','Teste da fonte',[['Amostra de vídeo','sample'],['Apenas disponibilidade HTTP','head'],['Desativado','off']],'sample','Só a amostra mede velocidade. HLS: testa uma variante e um segmento.'),
    {type:'toggle',key:'allowUnverified',label:'Aceitar alternativas sem velocidade aprovada',defaultValue:false,description:'Pode devolver fontes lentas ou não verificadas. Identificação no nome/descrição.'},
    text('totalTimeoutMs','Prazo total (ms)','6500','De 500 a 20000 ms; inclui consulta TMDB, fontes e testes.'),
    text('settleMs','Janela após primeiro aprovado (ms)','650','0 para devolver imediatamente; maior dá chance a outros idiomas/qualidades.'),
    text('probeTimeoutMs','Prazo por amostra (ms)','1400','De 100 a 5000 ms.'),
    text('advancedJson','Configuração avançada JSON','{"probeConcurrency":4,"minMbps":{"2160":20,"1080":6}}','Permite ajustar todos os campos descritos no README. Se definir qualities aqui, prevalece sobre os botões. Não coloque chaves em presets publicados.'),
    {type:'info',label:'Este plugin Kazuji retorna links HTTP de vídeo. No Mobile, TorBox do app resolve torrents de add-ons HTTP. TV tem contratos diferentes e requer a versão HTTP deste agregador. O plugin não acessa credenciais TorBox. Usa TMDB_API_KEY do app para título, créditos, idioma original e classificação.'},
  ];
}
module.exports={getStreams,onSettings};
