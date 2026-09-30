'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
// Immutable reference from https://pastebin.com/raw/mduTTf4M.
const base=JSON.parse(fs.readFileSync(path.join(root,'badges.base.json'),'utf8'));
const extra=JSON.parse(fs.readFileSync(path.join(root,'src/fusion-extra.json'),'utf8'));
const font=JSON.parse(fs.readFileSync(path.join(root,'src/fusion-glyphs.json'),'utf8'));
const filters=base.filters.map(filter=>({...filter,isEnabled:true,tagStyle:'filled',
  // Nuvio stream labels span three lines. Anchored upstream rules need DOTALL.
  pattern:filter.pattern.replace(/^\(\?i\)/,'(?is)')}));
const byId=new Map(filters.map(filter=>[filter.id,filter]));
byId.get('v-imax').groupId='edition-imax';
byId.get('a-at').groupId='audio-immersive';
byId.get('a-dv').groupId='visual-vision';
// Keep the actual audio codec alongside Atmos, and a declared HDR10 fallback
// alongside Dolby Vision. Keep the other specificity guards from the reference.
for(const id of ['a-th','a-dp','a-dd'])byId.get(id).pattern=byId.get(id).pattern.replace('(?!.*\\batmos\\b)','');
byId.get('v-hdr10').pattern=byId.get('v-hdr10').pattern.replace('(?!.*\\b(?:dv|dovi|dolby[\\s._-]?vision)\\b)','');
// 8.0 is not 7.1, and 5.0 is not 5.1. Do not infer the LFE channel.
byId.get('ch-71').pattern='(?i)(?:^|[^0-9])7[. ]1(?![0-9])';
byId.get('ch-51').pattern='(?i)(?:^|[^0-9])5[. ]1(?![0-9])';
const style={resolution:base.filters[0],source:byId.get('q-b'),codec:base.filters[0],
  hdr:byId.get('v-hdr'),audio:byId.get('a-dts'),channels:byId.get('ch-51'),
  depth:base.filters[0],language:byId.get('a-th'),multi:byId.get('a-th')};
const groupNames=new Map(extra.groups.map(group=>[group.id,group.name]));
const groups=base.groups.map(group=>({...group}));
const addGroup=(id,name,template)=>{
  if(!groups.some(group=>group.id===id))groups.push({id,name,color:template.textColor,borderColor:template.borderColor,isExpanded:true});
};
addGroup('edition-imax','IMAX',byId.get('v-imax'));
addGroup('audio-immersive','Immersive audio',byId.get('a-at'));
addGroup('visual-vision','Dolby Vision',byId.get('a-dv'));
const files=new Map();
function escape(text){return text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));}
const symbols={
  audio:'<path d="M3 29h14l17-14v50L17 51H3z"/><path d="M44 23q18 17 0 34" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>',
  codec:'<path d="M3 18h42v44H3z M10 25v30h28V25z" fill-rule="evenodd"/><path d="M20 30l13 10-13 10z"/>',
  camera:'<path d="M3 24h34v33H3z M39 33l16-10v36L39 49z"/>',
  wave:'<path d="M4 35v10m10-22v34m10-44v54m10-37v20m10-29v38" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/>',
  depth:'<path d="M4 39h10v24H4z M19 27h10v36H19z M34 15h10v48H34z"/>',
  cut:'<path d="M6 60L47 19M6 19l41 41" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/><circle cx="9" cy="18" r="9" fill="none" stroke="white" stroke-width="5"/><circle cx="9" cy="61" r="9" fill="none" stroke="white" stroke-width="5"/>',
  check:'<path d="M5 41l14 15 33-35" fill="none" stroke="white" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>',
  repack:'<path d="M49 25a24 24 0 1 0 4 22" fill="none" stroke="white" stroke-width="7"/><path d="M49 10v24H25z"/>',
  disc:'<circle cx="27" cy="40" r="24" fill="none" stroke="white" stroke-width="6"/><circle cx="27" cy="40" r="6" fill="none" stroke="white" stroke-width="5"/>',
};
function artwork(filter){
  const label=({'director-s-cut':'DC','multi-audio':'MULTI'}[filter.id]||filter.name).toUpperCase();
  const key=filter.groupId==='codec'?'codec':filter.groupId==='audio'?'wave':
    filter.groupId==='channels'||filter.groupId==='language'||filter.id.startsWith('audio-')||filter.groupId==='multi'?'audio':
    filter.groupId==='depth'?'depth':filter.id==='hdcam'?'camera':filter.id==='dvdrip'?'disc':
    filter.id==='director-s-cut'?'cut':filter.id==='proper'?'check':filter.id==='repack'?'repack':'';
  const scale=72/font.unitsPerEm;let x=key?70:7;
  const paths=[];
  for(const char of label){
    const glyph=font.glyphs[char];if(!glyph)throw new Error('Glifo Fusion ausente: '+char);
    if(glyph.path)paths.push('<path d="'+glyph.path+'" transform="translate('+x.toFixed(3)+' 66) scale('+scale+' '+(-scale)+')"/>');
    x+=glyph.advance*scale;
  }
  const width=Math.ceil(x+7);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="80" viewBox="0 0 '+width+' 80"><title>'+escape(filter.name)+'</title><g fill="#FFFFFF">'+(symbols[key]||'')+paths.join('')+'</g></svg>\n';
}
for(const filter of extra.filters){
  const template=style[filter.groupId] || (filter.id.startsWith('audio-')?byId.get('a-th'):byId.get('v-imax'));
  const derived={...filter,borderColor:template.borderColor,tagColor:template.tagColor,
    tagStyle:'filled',textColor:template.textColor,type:'filter'};
  filters.push(derived);addGroup(derived.groupId,groupNames.get(derived.groupId)||derived.name,template);
  if(derived.imageURL.startsWith('https://joaovpimenta.github.io/kazuji-media/')){
    // Versioned URLs prevent Coil from retaining the previous small, boxed art.
    // Outlined glyphs render identically without depending on device fonts.
    files.set('assets/fusion/'+derived.id+'-v2.svg',artwork(derived));
  }
}
files.set('badges.json',JSON.stringify({filters,groups},null,2)+'\n');
for(const [file,content]of files){
  const target=path.join(root,file);
  if(process.argv.includes('--check')){
    if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)throw new Error('Pacote Fusion desatualizado: execute npm run build:badges');
  }else fs.writeFileSync(target,content);
}
console.log('Fusion: '+base.filters.length+' emblemas da base + '+extra.filters.length+' complementos');
