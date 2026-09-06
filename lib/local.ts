import {mergeEntries,type Entry} from './records';
let connection:Promise<IDBDatabase>;
function db(){return connection??=new Promise((resolve,reject)=>{const r=indexedDB.open('stimmraum-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('entries',{keyPath:'id'});r.result.createObjectStore('audio');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function getEntries():Promise<Entry[]>{const d=await db();return new Promise((res,rej)=>{const r=d.transaction('entries').objectStore('entries').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
export async function saveEntries(entries:Entry[]){const d=await db();return new Promise<void>((res,rej)=>{
 const t=d.transaction(['entries','audio'],'readwrite');const store=t.objectStore('entries');
 for(const e of entries){const r=store.get(e.id);r.onsuccess=()=>{const old=r.result as Entry|undefined;const chosen=mergeEntries(old?[old]:[],[e])[0];if(chosen!==old)store.put(chosen);if(chosen.deleted)t.objectStore('audio').delete(chosen.id);};}
 t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);
});}
export async function saveAudio(entry:Entry,blob:Blob){const d=await db();return new Promise<void>((res,rej)=>{const t=d.transaction(['entries','audio'],'readwrite');t.objectStore('entries').put(entry);t.objectStore('audio').put(blob,entry.id);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);});}
export async function getAudio(id:string):Promise<Blob|undefined>{const d=await db();return new Promise((res,rej)=>{const r=d.transaction('audio').objectStore('audio').get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
export async function finishAudio(entry:Entry){const d=await db();return new Promise<void>((res,rej)=>{const t=d.transaction(['entries','audio'],'readwrite');t.objectStore('entries').put(entry);t.objectStore('audio').delete(entry.id);t.oncomplete=()=>res();t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);});}

export async function removeAudio(id:string){const d=await db();return new Promise<void>((resolve,reject)=>{const tx=d.transaction('audio','readwrite');tx.objectStore('audio').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
