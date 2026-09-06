import {database,identity,json,sameOrigin} from '@/lib/server';
import {tombstone} from '@/lib/records';
import {z} from 'zod';
const entry=z.object({id:z.string().min(1).max(100),kind:z.enum(['chat','message','template']),source:z.enum(['text','audio']).optional(),updated:z.number().int().nonnegative().max(1e15),created:z.number().int().nonnegative(),title:z.string().max(200).optional(),text:z.string().max(100000).optional(),chatId:z.string().max(100).optional(),provider:z.string().max(100).optional(),status:z.enum(['queued','processing','done','error','draft']).optional(),duration:z.number().nonnegative().optional(),error:z.string().max(1000).optional(),deleted:z.boolean().optional(),retryAt:z.number().optional(),attempts:z.number().optional()});
export async function POST(request:Request){
 const owner=identity(request);if(!owner)return json({error:'Bitte erneut anmelden.'},401);
 if(!sameOrigin(request))return json({error:'Ungültiger Ursprung'},403);
 try{
  if(Number(request.headers.get('content-length'))>2000000)return json({error:'Zu viele Daten'},413);
  const raw=await request.text();if(raw.length>2000000)return json({error:'Zu viele Daten'},413);
  const parsed=z.array(entry).max(1000).safeParse(JSON.parse(raw));if(!parsed.success)return json({error:'Ungültige Daten'},400);
  const db=database();
  for(let i=0;i<parsed.data.length;i+=50){
   const batch=parsed.data.slice(i,i+50).filter(e=>e.status!=='draft'||e.deleted).map(e=>{
    const clean=e.deleted?tombstone(e):e;
    return db.prepare(`INSERT INTO records (owner,id,payload,updated) VALUES (?,?,?,?)
     ON CONFLICT(owner,id) DO UPDATE SET payload=excluded.payload,updated=excluded.updated
     WHERE COALESCE(json_extract(excluded.payload,'$.deleted'),0)=1
      OR (COALESCE(json_extract(records.payload,'$.deleted'),0)=0 AND excluded.updated>records.updated)`)
      .bind(owner,clean.id,JSON.stringify(clean),clean.updated);
   });
   // Same atomic batch: remove stored transcript text for deletions and update edited text.
   batch.push(db.prepare(`DELETE FROM transcripts WHERE owner=? AND id IN
    (SELECT id FROM records WHERE owner=? AND json_extract(payload,'$.deleted')=1)`).bind(owner,owner));
   batch.push(db.prepare(`UPDATE transcripts SET text=(SELECT json_extract(payload,'$.text') FROM records WHERE records.owner=transcripts.owner AND records.id=transcripts.id)
    WHERE owner=? AND EXISTS (SELECT 1 FROM records WHERE records.owner=transcripts.owner AND records.id=transcripts.id
     AND json_extract(payload,'$.status')='done' AND COALESCE(json_extract(payload,'$.deleted'),0)=0)`).bind(owner));
   await db.batch(batch);
  }
  const rows=await db.prepare('SELECT payload FROM records WHERE owner=?').bind(owner).all<{payload:string}>();
  return json({entries:rows.results.map(r=>JSON.parse(r.payload))});
 }catch{return json({error:'Synchronisierung gerade nicht möglich. Deine lokalen Daten bleiben erhalten.'},503);}
}
