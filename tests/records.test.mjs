import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/records.ts',import.meta.url),'utf8');
const code=ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022});
const {chatText,mergeEntries,datetimeName,transcriptionResult}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('chat copying preserves order and excludes pending, deleted, and other chats',()=>{const base={kind:'message',chatId:'chat1',status:'done',updated:1};const entries=[{...base,id:'b',created:2,text:'Zweiter Gedanke'},{...base,id:'c',created:3,text:'Gelöscht',deleted:true},{...base,id:'a',created:1,text:'Erster Gedanke'},{...base,id:'d',created:4,status:'queued'},{...base,id:'e',created:5,text:'Fremder Chat',chatId:'chat2'}];assert.equal(chatText(entries,'chat1'),'Erster Gedanke\n\nZweiter Gedanke');});
test('sync keeps newer offline changes and tombstones',()=>{const local=[{id:'a',updated:5,text:'local'},{id:'b',updated:2}];const result=mergeEntries(local,[{id:'a',updated:3,text:'old'},{id:'b',updated:6,deleted:true},{id:'c',updated:1}]);assert.equal(result.find(e=>e.id==='a').text,'local');assert.equal(result.find(e=>e.id==='b').deleted,true);assert.equal(result.length,3);});

test('deletion wins over a late transcription regardless of timestamps',()=>{const deleted={id:'a',kind:'message',created:1,updated:10,deleted:true};const late={id:'a',kind:'message',created:1,updated:99,status:'done',text:'Should not return'};assert.equal(mergeEntries([deleted],[late])[0].deleted,true);const reverse=mergeEntries([late],[deleted])[0];assert.equal(reverse.deleted,true);assert.equal(reverse.text,undefined);assert.equal(transcriptionResult(deleted,'late result'),null);});
test('transcription completion preserves an already edited text',()=>{assert.equal(transcriptionResult({id:'a',status:'done',text:'Edited',updated:100},'Original'),null);assert.equal(transcriptionResult({id:'a',status:'processing',updated:100},'Original',101).text,'Original');});
test('new chat names use the local datetime with seconds',()=>{assert.equal(datetimeName(new Date(2026,8,6,9,4,3)),'2026-09-06 09:04:03');});
const amplitudeCode=ts.transpile(readFileSync(new URL('../lib/amplitude.ts',import.meta.url),'utf8'),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022});
const {microphoneLevel}=await import('data:text/javascript;base64,'+Buffer.from(amplitudeCode).toString('base64'));
test('microphone meter is flat for silence and constant DC offset',()=>{assert.equal(microphoneLevel(new Float32Array(2048)).level,0);assert.equal(microphoneLevel(new Float32Array(2048).fill(.25)).level,0);});
test('microphone meter reflects actual signal amplitude',()=>{const loud=new Float32Array(2048).map((_,i)=>.5*Math.sin(i*.1));const quiet=loud.map(v=>v*.1);assert.ok(microphoneLevel(loud).level>microphoneLevel(quiet).level);assert.ok(Math.abs(microphoneLevel(loud).db-microphoneLevel(quiet).db-20)<.01);});
