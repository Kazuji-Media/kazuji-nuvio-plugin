'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
// Immutable reference from https://pastebin.com/raw/mduTTf4M.
const base=JSON.parse(fs.readFileSync(path.join(root,'badges.base.json'),'utf8'));
const extra=JSON.parse(fs.readFileSync(path.join(root,'src/fusion-extra.json'),'utf8'));
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
for(const filter of extra.filters){
  const template=style[filter.groupId] || (filter.id.startsWith('audio-')?byId.get('a-th'):byId.get('v-imax'));
  const derived={...filter,borderColor:template.borderColor,tagColor:template.tagColor,
    tagStyle:'filled',textColor:template.textColor,type:'filter'};
  filters.push(derived);addGroup(derived.groupId,groupNames.get(derived.groupId)||derived.name,template);
  const width=Math.max(48,derived.name.length*9+16);
  // New symbols follow the reference: white artwork on a transparent canvas.
  files.set('assets/fusion/'+derived.id+'.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="28" viewBox="0 0 '+width+' 28"><text x="'+width/2+'" y="19" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#FFFFFF">'+escape(derived.name)+'</text></svg>\n');
}
files.set('badges.json',JSON.stringify({filters,groups},null,2)+'\n');
for(const [file,content]of files){
  const target=path.join(root,file);
  if(process.argv.includes('--check')){
    if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)throw new Error('Pacote Fusion desatualizado: execute npm run build:badges');
  }else fs.writeFileSync(target,content);
}
console.log('Fusion: '+base.filters.length+' emblemas da base + '+extra.filters.length+' complementos');
