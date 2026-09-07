import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function isMissing(error) {
  return error?.code === 'ENOENT';
}

function digest(key) {
  return createHash('sha256').update(key).digest('hex');
}

/** Small private file store used by the local Node deployment. */
export function createLocalAudioStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });

  function paths(key) {
    const name = digest(key);
    return {
      data: join(directory, `${name}.audio`),
      metadata: join(directory, `${name}.json`),
    };
  }

  async function put(key, file) {
    const target = paths(key);
    const suffix = `.${process.pid}.${Date.now()}.tmp`;
    const dataPath = target.data + suffix;
    const metadataPath = target.metadata + suffix;
    const data = Buffer.from(await file.arrayBuffer());
    const metadata = JSON.stringify({
      name: typeof file.name === 'string' && file.name ? file.name : 'aufnahme.webm',
      type: typeof file.type === 'string' ? file.type : '',
    });

    await writeFile(dataPath, data, { mode: 0o600 });
    try {
      await writeFile(metadataPath, metadata, { mode: 0o600 });
      await rename(dataPath, target.data);
      await rename(metadataPath, target.metadata);
    } catch (error) {
      await Promise.allSettled([unlink(dataPath), unlink(metadataPath)]);
      throw error;
    }
  }

  async function get(key) {
    const target = paths(key);
    try {
      const [data, metadataText] = await Promise.all([
        readFile(target.data),
        readFile(target.metadata, 'utf8'),
      ]);
      const metadata = JSON.parse(metadataText);
      return {
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        name: typeof metadata.name === 'string' && metadata.name ? metadata.name : 'aufnahme.webm',
        type: typeof metadata.type === 'string' ? metadata.type : '',
      };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async function remove(key) {
    const target = paths(key);
    const results = await Promise.allSettled([unlink(target.data), unlink(target.metadata)]);
    for (const result of results) {
      if (result.status === 'rejected' && !isMissing(result.reason)) throw result.reason;
    }
  }

  return { put, get, delete: remove };
}
