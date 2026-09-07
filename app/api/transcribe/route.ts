import {audioKey,audioStorage,config,database,identity,json,sameOrigin} from '@/lib/server';

const MAX_AUDIO_BYTES=14*1024*1024;
const MAX_REQUEST_BYTES=15*1024*1024;
const providers=['openai','gemini','custom'];

function transcriptionText(provider:string,data:any){
 if(provider==='gemini')return typeof data?.output_text==='string'?data.output_text.trim():Array.isArray(data?.steps)?data.steps.flatMap((step:any)=>Array.isArray(step.content)?step.content.filter((part:any)=>part?.type==='text').map((part:any)=>part.text||''):[]).join('').trim():Array.isArray(data?.outputs)?data.outputs.flatMap((step:any)=>Array.isArray(step.content)?step.content.filter((part:any)=>part?.type==='text').map((part:any)=>part.text||''):step?.type==='text'?[step.text||'']:[]).join('').trim():'';
 return typeof data?.text==='string'?data.text.trim():'';
}

export async function POST(request:Request){
 const owner=identity(request);if(!owner)return json({error:'Bitte erneut anmelden.'},401);
 if(!sameOrigin(request))return json({error:'Ungültiger Ursprung'},403);
 try{
  if(Number(request.headers.get('content-length'))>MAX_REQUEST_BYTES)return json({error:'Aufnahme zu groß. Maximal 14 MB.'},413);
  const form=await request.formData();
  const audioValue=form.get('audio');
  const id=String(form.get('id')||'');
  const provider=String(form.get('provider')||'');
  const force=['1','true','yes'].includes(String(form.get('force')||'').toLowerCase());
  if((!force&&!(audioValue instanceof File))||!id||id.length>100||!providers.includes(provider))return json({error:'Ungültige Aufnahme'},400);
  if(audioValue instanceof File&&(audioValue.size>MAX_AUDIO_BYTES||audioValue.size===0))return json({error:'Aufnahme leer oder größer als 14 MB.'},413);

  const db=database();
  const record=await db.prepare('SELECT payload FROM records WHERE owner=? AND id=?').bind(owner,id).first<{payload:string}>();
  const current=record?JSON.parse(record.payload):null;
  if(current?.deleted)return json({error:'Die Nachricht wurde gelöscht.'},410);
  if(!force&&current?.status==='done')return json({text:current.text||''});
  const cached=await db.prepare('SELECT text FROM transcripts WHERE owner=? AND id=?').bind(owner,id).first<{text:string}>();
  if(!force&&cached)return json({text:cached.text});

  const store=audioStorage();
  let audio:File;
  if(audioValue instanceof File){
   audio=audioValue;
   if(store){
    try{await store.put(audioKey(owner,id),audio);}
    catch{return json({error:'Die Aufnahme konnte auf dem Server nicht gespeichert werden.'},503);}
   }
  }else{
   if(!store)return json({error:'Für diese Nachricht ist kein serverseitiges Audioarchiv eingerichtet.'},503);
   const stored=await store.get(audioKey(owner,id));
   if(!stored)return json({error:'Für diese Nachricht ist keine Audiodatei auf dem Server vorhanden.'},404);
   audio=new File([stored.data],stored.name||'aufnahme.webm',{type:stored.type||'audio/webm'});
  }

  const c=config();let response:Response;const signal=AbortSignal.timeout(110000);
  if(provider==='gemini'){
   if(!c.GEMINI_API_KEY||!c.GEMINI_MODEL)return json({error:'Gemini ist auf dem Server noch nicht eingerichtet.'},503);
   const bytes=new Uint8Array(await audio.arrayBuffer());const mimeType=audio.type.split(';')[0]||'audio/webm';
   const uploadStart=await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files',{method:'POST',signal,headers:{'Content-Type':'application/json','x-goog-api-key':c.GEMINI_API_KEY,'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(bytes.byteLength),'X-Goog-Upload-Header-Content-Type':mimeType},body:JSON.stringify({file:{display_name:'stimmraum-audio'}})});
   if(!uploadStart.ok)return json({error:'Gemini konnte die Audiodatei nicht annehmen.'},502);
   const uploadUrl=uploadStart.headers.get('x-goog-upload-url');if(!uploadUrl)return json({error:'Gemini hat keine Upload-Adresse geliefert.'},502);
   const uploadResponse=await fetch(uploadUrl,{method:'POST',signal,headers:{'Content-Length':String(bytes.byteLength),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize','Content-Type':mimeType},body:bytes});
   if(!uploadResponse.ok)return json({error:'Gemini konnte die Audiodatei nicht verarbeiten.'},502);
   const uploadData=await uploadResponse.json() as any;const fileUri=uploadData.file?.uri;if(typeof fileUri!=='string'||!fileUri)return json({error:'Gemini hat keine Audiodatei-Referenz geliefert.'},502);
   response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',signal,headers:{'Content-Type':'application/json','x-goog-api-key':c.GEMINI_API_KEY},body:JSON.stringify({model:c.GEMINI_MODEL,input:[{type:'audio',uri:fileUri,mime_type:mimeType}],generation_config:{transcription_config:{language_codes:[],mode:'verbatim'}}})});
  }else{
   const custom=provider==='custom';const key=custom?c.STT_API_KEY:c.OPENAI_API_KEY;
   if((!custom&&!key)||(custom&&(!c.STT_BASE_URL||!c.STT_MODEL)))return json({error:'Der Transkriptionsdienst ist auf dem Server noch nicht eingerichtet.'},503);
   const base=custom?c.STT_BASE_URL!:'https://api.openai.com/v1';if(!base.startsWith('https://'))return json({error:'Der Server-Endpunkt muss HTTPS verwenden.'},503);
   const body=new FormData();body.set('file',audio,audio.name||'aufnahme.webm');body.set('model',custom?c.STT_MODEL!:c.OPENAI_TRANSCRIBE_MODEL||'gpt-4o-mini-transcribe');body.set('response_format','json');
   response=await fetch(base.replace(/\/$/,'')+'/audio/transcriptions',{method:'POST',headers:key?{Authorization:'Bearer '+key}:{},body,signal});
  }
  if(!response.ok){const status=response.status;return json({error:status===429?'Anbieter ausgelastet oder Kontingent erreicht. Später erneut versuchen.':status===401||status===403?'Der Anbieter hat den Server-Zugang abgelehnt. Bitte Konfiguration prüfen.':'Die Transkription ist fehlgeschlagen. Deine Aufnahme bleibt erhalten.'},status===429?429:502);}
  const data=await response.json() as any;const text=transcriptionText(provider,data);if(!text)return json({error:'Keine Sprache erkannt. Die Aufnahme bleibt zum Abspielen erhalten.'},422);
  if(force&&current&&!current.deleted){
   const previousUpdated=Number(current.updated||0);const updated=Math.max(Date.now(),previousUpdated+1);
   const replaced={...current,status:'done',text,provider,error:undefined,attempts:0,retryAt:0,updated};
   await db.prepare("UPDATE records SET payload=?,updated=? WHERE owner=? AND id=? AND updated=? AND COALESCE(json_extract(payload,'$.deleted'),0)=0").bind(JSON.stringify(replaced),updated,owner,id,previousUpdated).run();
  }
  if(force)await db.prepare("INSERT INTO transcripts (owner,id,text) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM records WHERE owner=? AND id=? AND json_extract(payload,'$.deleted')=1) ON CONFLICT(owner,id) DO UPDATE SET text=excluded.text").bind(owner,id,text,owner,id).run();
  else await db.prepare("INSERT INTO transcripts (owner,id,text) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM records WHERE owner=? AND id=? AND json_extract(payload,'$.deleted')=1) ON CONFLICT(owner,id) DO NOTHING").bind(owner,id,text,owner,id).run();
  const saved=await db.prepare('SELECT text FROM transcripts WHERE owner=? AND id=?').bind(owner,id).first<{text:string}>();if(!saved)return json({error:'Die Nachricht wurde gelöscht.'},410);
  return json({text:saved.text});
 }catch{return json({error:'Verbindung oder Verarbeitung unterbrochen. Die Aufnahme bleibt gespeichert.'},503);}
}
