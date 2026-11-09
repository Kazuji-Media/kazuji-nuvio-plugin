'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const pack=require('../badges.json');

function languages(text){
  return pack.filters.filter(f=>f.id.startsWith('audio-')||f.id==='pt-br').filter(f=>
    new RegExp(f.pattern.replace(/^\(\?i\)/,''),'i').test(text)
  ).map(f=>f.name);
}

test('all badge images are local uniform PNGs in the current repository',()=>{
  const fs=require('node:fs'),path=require('node:path');
  assert.equal(pack.filters.length,54);
  for(const badge of pack.filters){
    assert.equal(badge.imageURL,
      'https://raw.githubusercontent.com/Kazuji-Media/kazuji-nuvio-plugin/main/assets/fusion/'+badge.id+'-v3.png');
    const image=fs.readFileSync(path.join(__dirname,'../assets/fusion',badge.id+'-v3.png'));
    assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(image.readUInt32BE(20),80);
    assert.equal(image[25],6,'RGBA PNG with alpha');
  }
});

test('language badges only match codes in an audio metadata list',()=>{
  assert.deepEqual(languages('Áudio: pt-BR, en, ja · HEVC'),['PT-BR','EN','JA']);
  assert.deepEqual(languages('Audio: en-US, pt-PT'),['EN','PT']);
  assert.deepEqual(languages('Áudio: pt_BR, en_GB'),['PT-BR','EN']);
  assert.deepEqual(languages('Áudio: ja, es, fr, de, it, ru'),['JA','ES','FR','DE','IT','RU']);
  for(const text of ['Legendas: pt, en','Legendas: pt-BR','Film, en','Áudio: pt\nLegendas: ja, en','Áudio: enochian','Audio: en-US-extra']){
    assert.equal(languages(text).includes('EN'),false,text);
    assert.equal(languages(text).includes('PT-BR'),false,text);
  }
  assert.deepEqual(languages('Áudio: pt-BR'),['PT-BR']);
});
