import sqlite3 from 'sqlite3'
import path from 'path'
import fs from 'fs'

const dbDir = path.join(__dirname, '../../data')
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

sqlite3.verbose()

const db = new sqlite3.Database(path.join(dbDir, 'parts.db'))

function run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

function get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row as T)
    })
  })
}

function all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows as T[])
    })
  })
}

function exec(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function pragma(sql: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(`PRAGMA ${sql}`, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

export async function initDb() {
  await exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      contact TEXT,
      phone TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      specification TEXT,
      unit TEXT DEFAULT '个',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS car_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year_range TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(brand, model, year_range)
    );

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_no TEXT NOT NULL UNIQUE,
      part_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      production_date INTEGER NOT NULL,
      shelf_location TEXT,
      quantity INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (part_id) REFERENCES parts(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS batch_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT NOT NULL UNIQUE,
      batch_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS batch_car_models (
      batch_id INTEGER NOT NULL,
      car_model_id INTEGER NOT NULL,
      PRIMARY KEY (batch_id, car_model_id),
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
      FOREIGN KEY (car_model_id) REFERENCES car_models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recalls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      recall_date INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS suspensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL UNIQUE,
      reason TEXT NOT NULL,
      issue_count INTEGER NOT NULL DEFAULT 0,
      suspended_at INTEGER NOT NULL,
      suspended_by TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS issue_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      reported_at INTEGER NOT NULL,
      reported_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    );

    CREATE INDEX IF NOT EXISTS idx_batches_part_id ON batches(part_id);
    CREATE INDEX IF NOT EXISTS idx_batches_supplier_id ON batches(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_batch_barcodes_batch_id ON batch_barcodes(batch_id);
    CREATE INDEX IF NOT EXISTS idx_recalls_batch_id ON recalls(batch_id);
    CREATE INDEX IF NOT EXISTS idx_suspensions_batch_id ON suspensions(batch_id);
    CREATE INDEX IF NOT EXISTS idx_issue_records_batch_id ON issue_records(batch_id);
  `)
}

export const dbAsync = { run, get, all, exec, pragma }
export default db
