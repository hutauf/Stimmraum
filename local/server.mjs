import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import { Readable } from 'node:stream';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openLocalDatabase } from './database.mjs';
import { createLocalAudioStore } from './audio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const port = Number(process.env.STIMMRAUM_PORT ?? 3000);
const configuredPublicHost = String(process.env.STIMMRAUM_PUBLIC_HOST || '').trim();
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('STIMMRAUM_PORT muss eine gültige Portnummer sein.');
const entrypoint = resolve(root, 'dist/server/index.js');
if (!existsSync(entrypoint)) throw new Error('Build fehlt. Bitte zuerst npm run build:local ausführen.');
const dataDirectory = resolve(root, process.env.STIMMRAUM_DATA_DIR || 'data');
const database = openLocalDatabase(resolve(dataDirectory, 'stimmraum.sqlite'), resolve(root, 'drizzle'));
const runtime = { DB: database, AUDIO: createLocalAudioStore(resolve(dataDirectory, 'audio')) };
for (const name of ['OPENAI_API_KEY','OPENAI_TRANSCRIBE_MODEL','GEMINI_API_KEY','GEMINI_MODEL','STT_BASE_URL','STT_MODEL','STT_API_KEY']) {
  if (process.env[name]) runtime[name] = process.env[name];
}
// This adapter exists only in the explicitly launched local Node process.
// Hosted Worker identity and authentication code are unchanged.
globalThis.__stimmraumLocalRuntime = runtime;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return {
      url: 'data:text/javascript,export const env=globalThis.__stimmraumLocalRuntime;', shortCircuit: true,
    };
    return nextResolve(specifier, context);
  },
});
const { default: worker } = await import(pathToFileURL(entrypoint).href);
const publicRoot = resolve(root, 'dist/client');
const types = { '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json', '.woff':'font/woff', '.woff2':'font/woff2', '.ico':'image/x-icon', '.json':'application/json' };
function staticResponse(pathname, method) {
  let decoded; try { decoded = decodeURIComponent(pathname); } catch { return new Response('Bad path', { status: 400 }); }
  const path = resolve(publicRoot, '.' + decoded);
  if (!path.startsWith(publicRoot + sep) || !existsSync(path) || !statSync(path).isFile()) return null;
  const headers = { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Cache-Control':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache' };
  const body = method === 'HEAD' ? null : Readable.toWeb(createReadStream(path));
  return new Response(body, { headers });
}
const jobs = new Set();
let actualPort = port;
const server = createServer(async (incoming, outgoing) => {
  try {
    // Loopback binding and strict Host validation prevent exposing the single-user server to the LAN or DNS rebinding.
    const incomingHost = incoming.headers.host || '';
    const hosts = new Set([`localhost:${actualPort}`, `127.0.0.1:${actualPort}`]);
    if (!hosts.has(incomingHost)) { outgoing.writeHead(403); outgoing.end('Localhost only'); return; }
    // Behind Nginx, keep the loopback Host validation but reconstruct the public
    // origin so framework CSRF/origin checks compare against the browser's origin.
    const forwardedHost = typeof incoming.headers['x-forwarded-host'] === 'string'
      ? incoming.headers['x-forwarded-host'].split(',')[0].trim()
      : '';
    const forwardedProto = typeof incoming.headers['x-forwarded-proto'] === 'string'
      ? incoming.headers['x-forwarded-proto'].split(',')[0].trim()
      : '';
    const proxyOrigin = configuredPublicHost && forwardedHost === configuredPublicHost &&
      (forwardedProto === 'http' || forwardedProto === 'https')
      ? forwardedProto + '://' + forwardedHost
      : 'http://' + incomingHost;
    const url = new URL(incoming.url || '/', proxyOrigin);
    if (url.pathname.startsWith('/api/') && incoming.headers['sec-fetch-site'] === 'cross-site') { outgoing.writeHead(403); outgoing.end('Cross-site request rejected'); return; }
    let response = ['GET', 'HEAD'].includes(incoming.method) ? staticResponse(url.pathname, incoming.method) : null;
    if (!response) {
      const chunks = []; let total = 0;
      for await (const chunk of incoming) {
        total += chunk.length;
        if (total > 15 * 1024 * 1024) { outgoing.writeHead(413); outgoing.end('Upload too large'); return; }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value && !name.startsWith('oai-authenticated-') && !['host', 'connection', 'transfer-encoding', 'content-length'].includes(name)) headers.set(name, Array.isArray(value) ? value.join(',') : value);
      }
      headers.set('oai-authenticated-user-id', 'stimmraum-local-user');
      headers.set('oai-authenticated-user-email', 'local@localhost');
      const method = incoming.method || 'GET';
      const request = new Request(url, { method, headers, ...(!['GET','HEAD'].includes(method) ? { body:Buffer.concat(chunks) } : {}) });
      response = await worker.fetch(request, { ...runtime, ASSETS:{ fetch:async req=>staticResponse(new URL(req.url).pathname, req.method)||new Response('Not found',{status:404}) } }, {
        waitUntil(promise) { jobs.add(promise); promise.catch(()=>{}).finally(()=>jobs.delete(promise)); },
        passThroughOnException() {},
      });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (incoming.method === 'HEAD' || !response.body) outgoing.end();
    else Readable.fromWeb(response.body).on('error',()=>outgoing.destroy()).pipe(outgoing);
  } catch (error) {
    // Do not log request bodies, audio, environment values, or upstream secrets.
    console.error('Lokale Anfrage fehlgeschlagen:', error?.name || 'Error');
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type':'application/json' });
    outgoing.end(JSON.stringify({ error:'Lokaler Serverfehler. Bitte erneut versuchen.' }));
  }
});
server.listen(port, '127.0.0.1', () => {
  actualPort = server.address().port;
  console.log(`Stimmraum: http://localhost:${actualPort}`);
  console.log(`Lokale Daten: ${dataDirectory}`);
  console.log('Beenden mit Strg+C.');
});
server.on('error', error=>{console.error(error.code==='EADDRINUSE'?'Port ist bereits belegt. STIMMRAUM_PORT in .env.local ändern.':error.message);database.close();process.exitCode=1;});
let closing=false;
function shutdown(){if(closing)return;closing=true;server.close(async()=>{await Promise.allSettled([...jobs]);database.close();process.exit(0);});setTimeout(()=>process.exit(0),5000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
