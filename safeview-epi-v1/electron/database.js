// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
const path = require('path');
const fs   = require('fs');
const { app } = require('electron');

let db        = null;
let dbPath    = null;
let saveTimer = null;

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = db.export();
    fs.writeFile(dbPath, Buffer.from(data), (err) => {
      if (err) console.error('[DB] Erro ao salvar banco:', err.message);
    });
    saveTimer = null;
  }, 500);
}

function saveFlushed() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

async function initDb() {
  const initSqlJs = require('sql.js');
  const wasmDir   = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');
  const SQL = await initSqlJs({ locateFile: file => path.join(wasmDir, file) });
  dbPath = path.join(app.getPath('userData'), 'safeview.db');
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS sessoes_de_monitoramento (
      id                     TEXT PRIMARY KEY,
      created_at             TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      duracao_segundos       INTEGER NOT NULL DEFAULT 0,
      eventos_bocejos        INTEGER NOT NULL DEFAULT 0,
      eventos_olhos_fechados INTEGER NOT NULL DEFAULT 0,
      media_fadiga           REAL NOT NULL DEFAULT 0,
      pico_fadiga            REAL NOT NULL DEFAULT 0,
      total_alertas          INTEGER NOT NULL DEFAULT 0,
      nome_funcionario       TEXT,
      local_trabalho         TEXT,
      trabalho_realizado     TEXT,
      informacoes_adicionais TEXT
    );
  `);
  const migrations = [
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN nome_funcionario       TEXT`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN local_trabalho         TEXT`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN trabalho_realizado     TEXT`,
    `ALTER TABLE sessoes_de_monitoramento ADD COLUMN informacoes_adicionais TEXT`,
  ];
  let migrationRan = false;
  for (const migration of migrations) {
    try { db.run(migration); migrationRan = true; } catch { /* coluna já existe */ }
  }
  if (migrationRan) saveFlushed();
  console.log('[DB] Banco inicializado em:', dbPath);
}

function queryAll(sql, params) {
  let stmt;
  const rows = [];
  try {
    stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    while (stmt.step()) rows.push(stmt.getAsObject());
  } finally {
    stmt?.free();
  }
  return rows;
}

function queryOne(sql, params) {
  return queryAll(sql, params)[0] || null;
}

function run(sql, params) {
  db.run(sql, params || []);
  save();
}

module.exports = { initDb, queryAll, queryOne, run, saveFlushed };
