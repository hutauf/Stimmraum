import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLocalDatabase } from '../local/database.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function launch(data) {
  const child = spawn(process.execPath, ['local/server.mjs'], {
    cwd: root, env: { ...process.env, STIMMRAUM_PORT: '0', STIMMRAUM_DATA_DIR: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Server startup timeout: ' + output)); }, 15000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited (${code}): ${output}`)); });
  });
  return { url, async stop() { if (child.exitCode !== null) return; const ended = once(child, 'exit'); child.kill(); await ended; } };
}

test('local server serves app and persists edits/deletions across restart', async () => {
  const data = await mkdtemp(join(tmpdir(), 'stimmraum-http-'));
  let server;
  try {
    server = await launch(data);
    const home = await fetch(server.url);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /Stimmraum/);
    const asset = html.match(/(?:src|href)="(\/assets\/[^" ]+\.js)"/);
    assert.ok(asset, 'SSR contains a JavaScript asset');
    assert.equal((await fetch(server.url + asset[1])).status, 200);
    assert.equal((await fetch(server.url + '/manifest.webmanifest')).status, 200);
    const providers = await (await fetch(server.url + '/api/providers')).json();
    assert.equal(providers.providers.length, 3);
    const badHostStatus = await new Promise((resolve,reject) => {
      const request = httpRequest(server.url + '/api/providers', {headers:{host:'attacker.example'}}, response => {response.resume();resolve(response.statusCode);});
      request.on('error',reject); request.end();
    });
    assert.equal(badHostStatus, 403);
    assert.equal((await fetch(server.url + '/api/providers', {headers: {'sec-fetch-site': 'cross-site'}})).status, 403);
    assert.equal((await fetch(server.url + '/api/sync', {method: 'POST', headers: {origin: 'https://attacker.example'}, body: '[]'})).status, 403);
    async function sync(entries) {
      const response = await fetch(server.url + '/api/sync', {method: 'POST', headers: {'content-type': 'application/json', origin: server.url}, body: JSON.stringify(entries)});
      assert.equal(response.status, 200);
      return (await response.json()).entries;
    }
    const chat = {id:'chat-test',kind:'chat',title:'Lokaler Test',created:1,updated:1};
    const message = {id:'message-test',kind:'message',chatId:chat.id,source:'text',text:'Hallo',status:'done',created:2,updated:2};
    assert.equal((await sync([chat,message])).length, 2);
    assert.equal((await sync([{...message,text:'Bearbeitet',updated:3}])).find(e=>e.id===message.id).text, 'Bearbeitet');
    await server.stop();
    server = await launch(data);
    assert.equal((await sync([])).find(e=>e.id===message.id).text, 'Bearbeitet');
    const deleted = (await sync([{...message,deleted:true,updated:4}])).find(e=>e.id===message.id);
    assert.equal(deleted.deleted, true);
    assert.ok(!deleted.text);
    assert.equal((await sync([{...message,updated:99}])).find(e=>e.id===message.id).deleted, true);
  } finally { await server?.stop(); await rm(data, {recursive:true,force:true}); }
});

test('SQLite adapter rolls back a failing batch and applies migrations once', async () => {
  const data = await mkdtemp(join(tmpdir(), 'stimmraum-db-'));
  let db;
  try {
    const filename = join(data,'test.sqlite');
    db = openLocalDatabase(filename, join(root,'drizzle'));
    const insert = () => db.prepare('INSERT INTO records(owner,id,payload,updated) VALUES (?,?,?,?)').bind('test','same','{}',1);
    await assert.rejects(db.batch([insert(),insert()]));
    assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM records').first('count'),0);
    await insert().run();
    db.close(); db = openLocalDatabase(filename, join(root,'drizzle'));
    assert.equal(await db.prepare('SELECT COUNT(*) AS count FROM records').first('count'),1);
  } finally { db?.close(); await rm(data,{recursive:true,force:true}); }
});
