'use strict';
const http=require('node:http');
const https=require('node:https');
const dns=require('node:dns').promises;
const net=require('node:net');

function publicAddress(ip) {
  if(net.isIPv4(ip)){
    const [a,b,c]=ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||
      a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||
      a===192&&(b===168||b===0||b===2)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
  }
  if(net.isIPv6(ip)){
    const s=ip.toLowerCase();
    // Conservatively accept only global unicast; reject docs, transition and special prefixes.
    return /^[23][0-9a-f]{3}:/.test(s)&&!/^2001:(db8|0|2|10|20):/.test(s)&&!/^2002:/.test(s);
  }
  return false;
}
function createNodeTransport({allowPrivate=false,allowHttp=false}={}) {
  const agents={http:new http.Agent({keepAlive:true,maxSockets:32,maxTotalSockets:48}),https:new https.Agent({keepAlive:true,maxSockets:32,maxTotalSockets:48})};
  async function request(raw,options) {
    const deadline=Date.now()+options.timeoutMs;
    let url=new URL(raw);
    for(let redirects=0;redirects<=4;redirects++){
      if(!['http:','https:'].includes(url.protocol)||(!allowHttp&&url.protocol==='http:')||url.username||url.password)throw new Error('URL não permitida');
      const hostname=url.hostname.replace(/^\[|\]$/g,'');
      const records=net.isIP(hostname)?[{address:hostname,family:net.isIP(hostname)}]:await dns.lookup(hostname,{all:true});
      if(!records.length||(!allowPrivate&&records.some(x=>!publicAddress(x.address))))throw new Error('Destino não público');
      const record=records[0];
      if(options.signal && options.signal.aborted)throw new Error('Cancelado');
      const remaining=deadline-Date.now();
      if(remaining<=0)throw new Error('Tempo excedido');
      const result=await new Promise((resolve,reject)=>{
        let settled=false, timer;
        const transport=url.protocol==='https:'?https:http;
        const req=transport.request(url,{method:options.method||'GET',headers:Object.assign({'User-Agent':'Kazuji/1.0','Accept-Encoding':'identity'},options.headers),
          agent:agents[url.protocol==='https:'?'https':'http'],
          // DNS pinning: validation and connection use the same address (including redirects).
          lookup:(_host,lookupOptions,callback)=>lookupOptions.all?callback(null,[record]):callback(null,record.address,record.family),
        },res=>{
          const status=res.statusCode,headers={};
          for(const [k,v]of Object.entries(res.headers))headers[k]=Array.isArray(v)?v.join(','):String(v||'');
          if(status>=300&&status<400&&headers.location){res.destroy();finish(null,{status,headers,redirect:headers.location});return;}
          let size=0,finished=false;
          const chunks=[],maxBytes=options.maxBytes;
          function complete(truncated){
            if(finished)return;finished=true;
            const buffer=Buffer.concat(chunks,size);
            finish(null,{status,url:url.toString(),headers,bytes:new Uint8Array(buffer),text:buffer.toString('utf8'),truncated});
            if(truncated)res.destroy();
          }
          res.on('data',chunk=>{
            const remainingBytes=maxBytes-size;
            if(remainingBytes>0){const part=chunk.subarray(0,remainingBytes);chunks.push(part);size+=part.length;}
            if(chunk.length>remainingBytes)complete(true);
            // Stop as soon as a media sample is full, even if Range was ignored.
            else if(size>=maxBytes&&maxBytes>0&&options.headers&&options.headers.Range)complete(true);
          });
          res.on('end',()=>complete(false));
          res.on('error',e=>finish(e));
          if((options.method||'GET')==='HEAD')res.resume();
        });
        const aborted=()=>req.destroy(new Error('Cancelado'));
        function finish(error,result){
          if(settled)return;settled=true;clearTimeout(timer);
          if(options.signal)options.signal.removeEventListener('abort',aborted);
          error?reject(error):resolve(result);
        }
        req.on('error',e=>finish(e));
        timer=setTimeout(()=>req.destroy(new Error('Tempo excedido')),remaining);
        if(options.signal)options.signal.addEventListener('abort',aborted,{once:true});
        req.end();
      });
      if(!result.redirect)return result;
      const next=new URL(result.redirect,url);
      if(next.origin!==url.origin){
        const headers=Object.assign({},options.headers);
        for(const k of Object.keys(headers))if(/^(authorization|cookie|proxy-authorization)$/i.test(k))delete headers[k];
        options=Object.assign({},options,{headers});
      }
      url=next;
    }
    throw new Error('Redirecionamentos demais');
  }
  request.close=()=>Object.values(agents).forEach(a=>a.destroy());
  return request;
}
module.exports={createNodeTransport,publicAddress};
