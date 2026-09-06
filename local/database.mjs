import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

/** The D1 operations used by the app, backed by a local SQLite file. */
export function openLocalDatabase(filename, migrationDirectory) {
  mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
  for (const name of readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migrationDirectory, name), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = sqlite.prepare('SELECT checksum FROM local_migrations WHERE name=?').get(name);
    if (previous) {
      if (previous.checksum !== checksum) throw new Error(`Bereits angewendete Migration wurde verändert: ${name}`);
      continue;
    }
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.exec(sql);
      sqlite.prepare('INSERT INTO local_migrations VALUES (?,?)').run(name, checksum);
      sqlite.exec('COMMIT');
    } catch (error) { sqlite.exec('ROLLBACK'); sqlite.close(); throw error; }
  }
  function prepare(sql, args = []) {
    const statement = sqlite.prepare(sql);
    const result = rows => ({ results: rows, success: true, meta: {} });
    return {
      bind: (...values) => prepare(sql, values),
      first: async column => {
        const row = statement.get(...args);
        return row ? column ? row[column] : row : null;
      },
      all: async () => result(statement.all(...args)),
      raw: async () => statement.all(...args).map(row => Object.values(row)),
      run: async () => execute(),
      execute,
    };
    function execute() {
      const info = statement.run(...args);
      return { ...result([]), meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
    }
  }
  return {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const results = statements.map(statement => statement.execute()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    async exec(sql) { sqlite.exec(sql); return { count: 0, duration: 0 }; },
    close() { sqlite.close(); },
  };
}
