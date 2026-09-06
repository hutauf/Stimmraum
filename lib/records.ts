export type Entry = { id:string; kind:'chat'|'message'|'template'; source?:'text'|'audio'; updated:number; created:number; title?:string; text?:string; chatId?:string; provider?:string; status?:'queued'|'processing'|'done'|'error'|'draft'; duration?:number; error?:string; deleted?:boolean; retryAt?:number; attempts?:number };
export const orderedMessages = (entries:Entry[],chatId:string) => entries.filter(e=>e.kind==='message'&&e.chatId===chatId&&!e.deleted&&e.status!=='draft').sort((a,b)=>a.created-b.created||a.id.localeCompare(b.id));
export const chatText = (entries:Entry[],chatId:string) => orderedMessages(entries,chatId).filter(e=>e.status==='done'&&e.text?.trim()).map(e=>e.text!.trim()).join('\n\n');
export function tombstone(entry:Entry):Entry{return {id:entry.id,kind:entry.kind,chatId:entry.chatId,created:entry.created,updated:entry.updated,deleted:true};}
export function mergeEntries(local:Entry[],remote:Entry[]) {
 const m=new Map(local.map(e=>[e.id,e]));
 for(const e of remote){const old=m.get(e.id);if(old?.deleted)continue;if(e.deleted)m.set(e.id,tombstone(e));else if(!old||e.updated>old.updated)m.set(e.id,e);}
 return [...m.values()];
}
export function datetimeName(date=new Date()){
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function transcriptionResult(current:Entry|undefined,text:string,now=Date.now()):Entry|null{
 if(!current||current.deleted||current.status==='done')return null;
 return {...current,status:'done',text,error:undefined,updated:Math.max(now,current.updated+1)};
}
