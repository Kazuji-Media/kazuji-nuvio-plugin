'use strict';
const form=document.getElementById('config'),status=document.getElementById('status');
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button');button.disabled=true;status.textContent='Salvando configuração…';
  try{
    const data=Object.fromEntries(new FormData(form));
    for(const key of ['allowUnknownLanguage','allowUnknownCompatibility','allowUnverified'])data[key]=form.elements[key].checked;
    if(data.advancedJson){const extra=JSON.parse(data.advancedJson);if(!extra||Array.isArray(extra)||typeof extra!=='object')throw new Error('JSON avançado inválido');Object.assign(data,extra);}
    delete data.advancedJson;
    const response=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const body=await response.json();if(!response.ok)throw new Error(body.error||'Erro ao salvar');
    const manifest=new URL(body.manifestPath,location.origin).toString();
    document.getElementById('manifest').value=manifest;
    document.getElementById('install').href=manifest.replace(/^https?:\/\//,'stremio://');
    document.getElementById('result').hidden=false;status.textContent='Configuração salva.';
  }catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
});
document.getElementById('copy').addEventListener('click',async()=>{
  const field=document.getElementById('manifest');
  try{await navigator.clipboard.writeText(field.value);status.textContent='Link copiado.';}catch(_){field.select();status.textContent='Selecione e copie o link.';}
});
