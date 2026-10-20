import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

export function openDatabase(dir) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "lab.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS libraries (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_request ON events(request_id,id);
  `);
  return db;
}
let savepointId=0;
export function transaction(db, fn) {
  if(db.isTransaction){const name='lab_nested_'+(++savepointId);db.exec('SAVEPOINT '+name);try{const result=fn();db.exec('RELEASE '+name);return result;}catch(e){db.exec('ROLLBACK TO '+name);db.exec('RELEASE '+name);throw e;}}
  db.exec("BEGIN IMMEDIATE");
  try { const result = fn(); db.exec("COMMIT"); return result; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}

