import assert from 'node:assert/strict';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createLocalAudioStore} from '../local/audio.mjs';

test('local audio store preserves audio bytes and metadata until deletion',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'stimmraum-audio-'));
 try{
  const store=createLocalAudioStore(directory);
  const original=new File([new Uint8Array([1,2,3,4])],'aufnahme.webm',{type:'audio/webm'});
  await store.put('owner:message',original);
  const saved=await store.get('owner:message');
  assert.ok(saved);
  assert.equal(saved.name,'aufnahme.webm');
  assert.equal(saved.type,'audio/webm');
  assert.deepEqual([...new Uint8Array(saved.data)], [1,2,3,4]);
  assert.equal((await readdir(directory)).length,2);
  await store.delete('owner:message');
  assert.equal(await store.get('owner:message'),null);
  assert.deepEqual(await readdir(directory),[]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
