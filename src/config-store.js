'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
class ConfigStore {
  constructor(directory){this.file=path.join(directory,'configs.json');this.configs={};this.writes=Promise.resolve();}
  async load(){
    await fs.mkdir(path.dirname(this.file),{recursive:true,mode:0o700});
    try{const data=JSON.parse(await fs.readFile(this.file,'utf8'));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('Arquivo de configurações inválido');this.configs=data;}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  get(id){return this.configs[id];}
  async create(config){
    if(Object.keys(this.configs).length>=1000)throw new Error('Limite de configurações atingido');
    const id=crypto.randomBytes(24).toString('hex');
    this.configs[id]=config;
    const snapshot=JSON.stringify(this.configs);
    const operation=this.writes.then(async()=>{
      const temp=this.file+'.tmp';
      await fs.writeFile(temp,snapshot,{mode:0o600});
      await fs.rename(temp,this.file);
    });
    this.writes=operation.catch(()=>{});
    try{await operation;return id;}catch(error){delete this.configs[id];throw error;}
  }
}
module.exports={ConfigStore};
