import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env = globalThis.__stimmraumTestEnv;',shortCircuit:true};return next(specifier,context);}});
globalThis.__stimmraumTestEnv={};
const {default:worker}=await import('../dist/server/index.js');
const run=(path,init={})=>worker.fetch(new Request('https://stimmraum.test'+path,init),{ASSETS:{fetch:async()=>new Response('Not found',{status:404})}},{waitUntil(){},passThroughOnException(){}});
const auth={'oai-authenticated-user-id':'test-owner'};
test('renders German chat workspace and PWA metadata',async()=>{const r=await run('/',{headers:{accept:'text/html'}});assert.equal(r.status,200);const html=await r.text();assert.match(html,/stimmraum/);assert.match(html,/manifest.webmanifest/);assert.match(html,/lang="de"/);assert.match(html,/Aufnehmen/);assert.match(html,/Textnachricht senden/);assert.match(html,/Nachricht schreiben/);});
test('all data endpoints reject anonymous requests',async()=>{for(const [path,method]of [['/api/providers','GET'],['/api/sync','POST'],['/api/transcribe','POST']]){const r=await run(path,{method});assert.equal(r.status,401,path);}});
test('no providers pretend to be available without server configuration',async()=>{const r=await run('/api/providers',{headers:auth});assert.equal(r.status,200);const data=await r.json();assert.equal(data.providers.length,3);assert.ok(data.providers.every(p=>p.ready===false));});
test('cross-origin mutation rejected before parsing or storage',async()=>{const r=await run('/api/sync',{method:'POST',headers:{...auth,Origin:'https://untrusted.test'},body:'[]'});assert.equal(r.status,403);});
test('malformed sync data rejected',async()=>{const r=await run('/api/sync',{method:'POST',headers:auth,body:JSON.stringify([{id:'x',kind:'invalid',updated:1,created:1}])});assert.equal(r.status,400);});
test('audio upload size rejected before parsing',async()=>{const r=await run('/api/transcribe',{method:'POST',headers:{...auth,'Content-Length':'99999999'},body:'x'});assert.equal(r.status,413);});
test('previous completed transcript returned without another provider call',async()=>{globalThis.__stimmraumTestEnv.DB={prepare(sql){return {bind(owner,id){assert.equal(owner,'test-owner');assert.equal(id,'message-1');return {first:async()=>sql.includes('FROM records')?null:({text:'Bereits transkribiert.'})};}};}};const form=new FormData();form.set('audio',new Blob(['audio'],{type:'audio/webm'}),'audio.webm');form.set('id','message-1');form.set('provider','openai');const r=await run('/api/transcribe',{method:'POST',headers:auth,body:form});assert.equal(r.status,200);assert.equal((await r.json()).text,'Bereits transkribiert.');});

test('deleted message never reaches the provider',async()=>{globalThis.__stimmraumTestEnv.DB={prepare(sql){return {bind(){return {first:async()=>sql.includes('FROM records')?{payload:JSON.stringify({deleted:true})}:null};}};}};const form=new FormData();form.set('audio',new Blob(['audio'],{type:'audio/webm'}),'audio.webm');form.set('id','deleted-message');form.set('provider','gemini');const r=await run('/api/transcribe',{method:'POST',headers:auth,body:form});assert.equal(r.status,410);});
test('edited text takes precedence over cached transcription',async()=>{globalThis.__stimmraumTestEnv.DB={prepare(sql){return {bind(){return {first:async()=>sql.includes('FROM records')?{payload:JSON.stringify({status:'done',text:'Korrigierter Text'})}:{text:'Alte Transkription'}};}};}};const form=new FormData();form.set('audio',new Blob(['audio'],{type:'audio/webm'}),'audio.webm');form.set('id','edited-message');form.set('provider','gemini');const r=await run('/api/transcribe',{method:'POST',headers:auth,body:form});assert.equal(r.status,200);assert.equal((await r.json()).text,'Korrigierter Text');});

test('text messages remain completed and retain their type during server synchronization',async()=>{
 const rows=new Map();
 globalThis.__stimmraumTestEnv.DB={
  prepare(sql){
   return {bind(...args){return {sql,args,all:async()=>({results:[...rows.values()].map(payload=>({payload}))})};}};
  },
  async batch(statements){
   for(const statement of statements)if(statement.sql.includes('INSERT INTO records'))rows.set(statement.args[1],statement.args[2]);
   return [];
  }
 };
 const message={id:'typed-message',kind:'message',source:'text',chatId:'chat-1',text:'Eine geschriebene Notiz.\nZweite Zeile.',status:'done',created:10,updated:10};
 const response=await run('/api/sync',{method:'POST',headers:auth,body:JSON.stringify([message])});
 assert.equal(response.status,200);const saved=(await response.json()).entries[0];assert.equal(saved.source,'text');assert.equal(saved.status,'done');assert.equal(saved.text,message.text);assert.equal(saved.provider,undefined);
});
