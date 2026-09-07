import {env} from 'cloudflare:workers';
export type AudioInput={arrayBuffer():Promise<ArrayBuffer>;name?:string;type?:string};
export type StoredAudio={data:ArrayBuffer;name:string;type:string};
export type AudioStorage={put(key:string,file:AudioInput):Promise<void>;get(key:string):Promise<StoredAudio|null>;delete(key:string):Promise<void>};
export function database(){if(!env.DB)throw new Error('Datenbank nicht verfügbar');return env.DB;}
export function identity(request:Request){return request.headers.get('oai-authenticated-user-id');}
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
export function config(){return env as unknown as Record<string,string|undefined>;}
export function audioStorage(){return (env as unknown as {AUDIO?:AudioStorage}).AUDIO;}
export function audioKey(owner:string,id:string){return owner+':'+id;}
