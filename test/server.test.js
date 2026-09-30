'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createServer}=require('../src/server');
const {createNodeTransport,publicAddress}=require('../src/node-transport');
const {ConfigStore}=require('../src/config-store');
async function listen(server){await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;}
async function close(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
test('public address policy blocks private, mapped, reserved and metadata destinations',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','192.168.1.1','172.16.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1','2001:db8::1','2002:c000:201::1'])assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
test('Node transport bounds ignored Range, follows redirects, honors timeouts and denies local requests by default',async t=>{
  let closed=0;
  const upstream=http.createServer((req,res)=>{
    if(req.url==='/redirect'){res.writeHead(302,{Location:'/video'});res.end();return;}
    if(req.url==='/stall')return;
    res.writeHead(200,{'Content-Type':'video/mp4'});
    const interval=setInterval(()=>res.write(Buffer.alloc(65536)),3);
    res.on('close',()=>{closed++;clearInterval(interval);});
  });
  const base=await listen(upstream);t.after(()=>close(upstream));
  const request=createNodeTransport({allowPrivate:true,allowHttp:true});t.after(()=>request.close());
  const result=await request(base+'/redirect',{timeoutMs:1000,maxBytes:131072,headers:{Range:'bytes=0-131071'}});
  assert.equal(result.bytes.length,131072);assert.equal(result.truncated,true);assert.ok(result.url.endsWith('/video'));
  await new Promise(r=>setTimeout(r,30));assert.ok(closed>0);
  await assert.rejects(request(base+'/stall',{timeoutMs:30,maxBytes:1024}),/Tempo/);
  const safe=createNodeTransport({allowHttp:true});t.after(()=>safe.close());
  await assert.rejects(safe(base+'/video',{timeoutMs:100,maxBytes:1024}),/não público/);
});
test('persists opaque config IDs atomically and restores them after restart',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kazuji-store-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const a=new ConfigStore(dir);await a.load();const ids=await Promise.all([a.create({manifests:['secret1']}),a.create({manifests:['secret2']})]);
  const b=new ConfigStore(dir);await b.load();assert.equal(ids[0].length,48);assert.equal(b.get(ids[0]).manifests[0],'secret1');assert.equal(b.get(ids[1]).manifests[0],'secret2');
});
test('end-to-end configured addon works with two local upstreams and no TorBox account',async t=>{
  assert.equal(require('../src/server').manifest({manifests:[]}).logo,'https://joaovpimenta.github.io/kazuji-media/assets/logo.svg');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kazuji-server-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  let base,videoRequests=0;
  const upstream=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname.endsWith('manifest.json')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'test',name:'Test',resources:['stream'],types:['movie'],idPrefixes:['tt']}));return;}
    if(pathname.includes('/stream/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({streams:[{title:'1080p PT-BR',url:base+'/video.mp4'}]}));return;}
    videoRequests++;res.writeHead(206,{'Content-Type':'video/mp4','Content-Range':'bytes 0-262143/999999'});res.end(Buffer.alloc(262144));
  });
  base=await listen(upstream);t.after(()=>close(upstream));
  const request=createNodeTransport({allowPrivate:true,allowHttp:true});
  const server=await createServer({dataDir:dir,request,quiet:true,publicUrl:'https://kazuji.example'});const host=await listen(server);t.after(()=>close(server));
  const save=await fetch(host+'/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({manifests:[base+'/a/manifest.json',base+'/b/manifest.json'],qualities:[1080],settleMs:0})});
  assert.equal(save.status,201);const {manifestPath}=await save.json();
  const manifest=await (await fetch(host+manifestPath)).json();assert.equal(manifest.resources[0].name,'stream');assert.equal(JSON.stringify(manifest).includes(base),false);
  assert.equal(manifest.logo,'https://kazuji.example/assets/logo.svg');
  const result=await (await fetch(host+manifestPath.replace('manifest.json','stream/movie/tt123.json'))).json();
  assert.equal(result.streams.length,1);assert.match(result.streams[0].name,/1080p/);assert.equal(videoRequests,1);
  assert.equal(result.streams[0].behaviorHints.videoSize,999999);
  const badges=await(await fetch(host+'/badges.json')).json();
  assert.ok(badges.filters.length>=40);
  for(const badge of badges.filters){
    const asset=new URL(badge.imageURL);assert.equal(asset.origin,'https://kazuji.example');
    const icon=await fetch(host+asset.pathname);assert.equal(icon.status,200);assert.match(icon.headers.get('content-type'),/image\/svg\+xml/);
    assert.match(await icon.text(),/<svg/);
  }
  assert.equal((await fetch(host+'/assets/fusion/missing.svg')).status,404);
  assert.equal((await fetch(host+'/assets/logo.svg')).status,200);
  const invalid=await fetch(host+manifestPath.replace('manifest.json','stream/movie/garbage.json'));assert.equal(invalid.status,400);
  assert.equal((await fetch(host+'/c/'+'a'.repeat(48)+'/manifest.json')).status,404);
  assert.equal((await fetch(host+'/api/config',{method:'POST',body:'{"manifests":["file:///etc/passwd"]}'})).status,400);
  const page=await fetch(host+'/configure');assert.ok(page.headers.get('content-security-policy'));assert.match(await page.text(),/TorBox/);
});
