import {env} from 'cloudflare:workers';
export function database(){if(!env.DB)throw new Error('Datenbank nicht verfügbar');return env.DB;}
export function identity(request:Request){return request.headers.get('oai-authenticated-user-id');}
export const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
export function config(){return env as unknown as Record<string,string|undefined>;}
